import { expect, type Page, type Route } from '@playwright/test';

import type { NormalizedProjectConfig, ProjectSecrets } from '../../config/config-types.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import type { CaptureMetadata, SonarSourceEvidence } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import { boundedDiagnostics } from '../../workflow/diagnostics.js';
import { settleCleanup, withWorkflowDeadline, withWorkflowDeadlineAndLateResource, type WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import {
  captureFailureMessage,
  createRouteHandler,
  navigation as sonarNavigation,
  pageCaptureMetadata,
  projectKeyFromHome,
  assertProjectUrl,
  SONAR_VIEWPORT,
} from './sonarqube-capture-support.js';
import {
  assertHomeIdentity,
  captureIssuesStep,
  captureOverallStep,
  type SonarNavigation,
} from './sonarqube-capture-steps.js';
import { findAvailable, overviewCandidates, sonarLoginUsernameCandidates } from './sonarqube-locators.js';
import { isArchivedSonarqubeSnapshot, isSonarqubeLoginLocation } from './sonarqube-url-identity.js';
import { submitSonarqubeLogin } from './sonarqube-login-step.js';

function emptyResult(state: 'not_found' | 'incomplete', warnings: readonly string[]): SonarCaptureResult {
  const navigation: SonarNavigation = {
    'sonarqube-home': sonarNavigation('sonarqube-home', state),
    'sonarqube-overall': sonarNavigation('sonarqube-overall', 'incomplete'),
    'sonarqube-issues': sonarNavigation('sonarqube-issues', 'incomplete'),
  };
  const source: SonarSourceEvidence = {
    state, captures: [], navigation: Object.values(navigation), warnings: boundedDiagnostics([...warnings]),
  };
  return { source, navigation, screenshots: [], warnings: source.warnings };
}

function finalize(
  captures: readonly CaptureMetadata[],
  navigation: SonarNavigation,
  screenshots: readonly string[],
  warnings: readonly string[],
  facets?: SonarSourceEvidence['facets'],
): SonarCaptureResult {
  const finalWarnings = boundedDiagnostics([...new Set(warnings)]);
  const complete = Object.values(navigation).every((target) => target.state === 'found');
  const source: SonarSourceEvidence = {
    state: complete && finalWarnings.length === 0 ? 'found' : 'incomplete',
    captures: [...captures],
    navigation: Object.values(navigation),
    warnings: finalWarnings,
    ...(facets === undefined ? {} : { facets }),
  };
  return { source, navigation, screenshots: [...screenshots], warnings: finalWarnings };
}

export interface SonarCaptureInput {
  page: Page;
  project: NormalizedProjectConfig;
  deadline: WorkflowDeadline;
  outputDirectory: string;
  homeUrl?: string;
  discoveryWarnings?: readonly string[];
  secrets?: ProjectSecrets;
}

export interface SonarCaptureResult {
  source: SonarSourceEvidence;
  navigation: SonarNavigation;
  screenshots: readonly string[];
  warnings: readonly string[];
}

export async function captureSonarqubeEvidence(input: SonarCaptureInput): Promise<SonarCaptureResult> {
  const warnings: string[] = [...(input.discoveryWarnings ?? [])];
  const captures: CaptureMetadata[] = [];
  const screenshots: string[] = [];
  let facets: SonarSourceEvidence['facets'];
  let capturePage: Page | undefined;
  let routeHandler: ((route: Route) => Promise<void>) | undefined;
  let navigation: SonarNavigation = {
    'sonarqube-home': sonarNavigation('sonarqube-home', 'incomplete'),
    'sonarqube-overall': sonarNavigation('sonarqube-overall', 'incomplete'),
    'sonarqube-issues': sonarNavigation('sonarqube-issues', 'incomplete'),
  };
  try {
    if (input.homeUrl === undefined) {
      return emptyResult(warnings.length === 0 ? 'not_found' : 'incomplete', warnings.length === 0
        ? ['SonarQube destination was not uniquely discovered']
        : warnings);
    }
    const allowArchivedSnapshot = isArchivedSonarqubeSnapshot(new URL(input.homeUrl));
    const expectedKey = projectKeyFromHome(input.homeUrl, input.project);
    capturePage = await withWorkflowDeadlineAndLateResource(
      () => input.page.context().newPage(),
      input.deadline,
      (latePage) => settleCleanup(() => latePage.close()),
    );
    await withWorkflowDeadline(() => capturePage!.setViewportSize(SONAR_VIEWPORT), input.deadline);
    const routeState = { blocked: false };
    routeHandler = createRouteHandler(input.project, routeState, input.deadline);
    await withWorkflowDeadline(() => capturePage!.route('**/*', routeHandler!), input.deadline);
    const response = await withWorkflowDeadline(
      () => capturePage!.goto(input.homeUrl as string, { waitUntil: 'domcontentloaded', timeout: input.deadline.requireRemaining() }),
      input.deadline,
    );
    if (routeState.blocked) throw new Error('SonarQube request was blocked by the configured origin policy');
    if (response !== null && response.status() >= 400) throw new Error(`SonarQube home returned HTTP ${response.status()}`);

    const overview = overviewCandidates(capturePage!, expectedKey, input.project.name, allowArchivedSnapshot);
    const loginCandidates = sonarLoginUsernameCandidates(capturePage!);

    let needsLogin = false;
    await expect.poll(async () => {
      try {
        const currentUrl = new URL(capturePage!.url());
        if (isSonarqubeLoginLocation(currentUrl)) {
          needsLogin = true;
          return true;
        }
      } catch {
        // ignore invalid URL
      }

      const availableLogin = await findAvailable(loginCandidates);
      if (availableLogin !== undefined) {
        needsLogin = true;
        return true;
      }

      const availableOverview = await findAvailable(overview);
      if (availableOverview !== undefined) {
        needsLogin = false;
        return true;
      }

      return false;
    }, {
      timeout: Math.min(input.deadline.requireRemaining(), 10_000),
      intervals: [50, 100, 250, 500],
    }).toBe(true).catch(() => {
      try {
        if (isSonarqubeLoginLocation(new URL(capturePage!.url()))) {
          needsLogin = true;
        }
      } catch {
        // ignore
      }
    });

    if (needsLogin) {
      if (input.secrets === undefined || input.secrets.username.length === 0 || input.secrets.password.length === 0) {
        throw new Error('SonarQube home redirected to login but project credentials were not provided');
      }
      await submitSonarqubeLogin(capturePage!, input.secrets, input.deadline);
      if (routeState.blocked) throw new Error('SonarQube request was blocked by the configured origin policy');
      try {
        assertProjectUrl(capturePage!.url(), expectedKey, 'home', allowArchivedSnapshot);
      } catch {
        await withWorkflowDeadline(
          () => capturePage!.goto(input.homeUrl as string, { waitUntil: 'domcontentloaded', timeout: input.deadline.requireRemaining() }),
          input.deadline,
        );
      }
    }

    assertProjectUrl(
      assertAllowedUrl(capturePage.url(), deriveJenkinsBaseUrl(input.project.loginUrl, input.project.jobUrl), input.project.sourceOrigins.sonarqube, 'SonarQube home URL'),
      expectedKey,
      'home',
      allowArchivedSnapshot,
    );

    const homeStrategy = await assertHomeIdentity(capturePage, expectedKey, input.deadline, input.project.name, allowArchivedSnapshot);
    const validatedHomeUrl = assertProjectUrl(
      assertAllowedUrl(capturePage.url(), deriveJenkinsBaseUrl(input.project.loginUrl, input.project.jobUrl), input.project.sourceOrigins.sonarqube, 'SonarQube Overview URL'),
      expectedKey,
      'Overview',
      allowArchivedSnapshot,
    );
    captures.push(await pageCaptureMetadata(capturePage, validatedHomeUrl, homeStrategy, input.deadline));
    navigation = { ...navigation, 'sonarqube-home': sonarNavigation('sonarqube-home', 'found', validatedHomeUrl) };

    try {
      const overall = await captureOverallStep({ page: capturePage, project: input.project, expectedKey, deadline: input.deadline, outputDirectory: input.outputDirectory, allowArchivedSnapshot });
      captures.push(overall.capture);
      if (overall.screenshot !== undefined) screenshots.push(overall.screenshot);
      warnings.push(...overall.warnings);
      navigation = { ...navigation, 'sonarqube-overall': overall.navigation };
    } catch (error) {
      warnings.push(`SonarQube Overall capture failed: ${captureFailureMessage(error)}`);
      return finalize(captures, navigation, screenshots, warnings, facets);
    }

    try {
      const issues = await captureIssuesStep({ page: capturePage, project: input.project, expectedKey, deadline: input.deadline, outputDirectory: input.outputDirectory, allowArchivedSnapshot });
      captures.push(issues.capture);
      if (issues.screenshot !== undefined) screenshots.push(issues.screenshot);
      facets = issues.facets;
      warnings.push(...issues.warnings);
      navigation = { ...navigation, 'sonarqube-issues': issues.navigation };
    } catch (error) {
      warnings.push(`SonarQube Issues capture failed: ${captureFailureMessage(error)}`);
      return finalize(captures, navigation, screenshots, warnings, facets);
    }

    return finalize(captures, navigation, screenshots, warnings, facets);
  } catch (error) {
    warnings.push(captureFailureMessage(error));
    return finalize(captures, navigation, screenshots, warnings, facets);
  } finally {
    if (capturePage !== undefined) {
      await withWorkflowDeadline(async () => {
        if (routeHandler !== undefined) {
          await capturePage!.unroute('**/*', routeHandler).catch(() => undefined);
        }
        await capturePage!.close().catch(() => undefined);
      }, input.deadline).catch(() => undefined);
    }
  }
}
