import { type Page } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../config/config-types.js';
import type { CaptureMetadata, NavigationTargets, SonarSourceEvidence } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import { boundedDiagnostics } from '../../workflow/diagnostics.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import { pageLinkCandidates } from '../snyk/snyk-capture-support.js';
import { classifySonarLinks } from '../source-link-classifier.js';
import {
  captureFailureMessage,
  createRouteHandler,
  navigation as sonarNavigation,
  pageCaptureMetadata,
  projectKeyFromHome,
  assertProjectUrl,
  SONAR_VIEWPORT,
  terminalIdentity,
} from './sonarqube-capture-support.js';
import {
  assertHomeIdentity,
  captureIssuesStep,
  captureOverallStep,
  type SonarNavigation,
} from './sonarqube-capture-steps.js';
import { isArchivedSonarqubeSnapshot } from './sonarqube-url-identity.js';

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
    captures: [...captures], navigation: Object.values(navigation), warnings: finalWarnings,
    ...(facets === undefined ? {} : { facets }),
  };
  return { source, navigation, screenshots: [...screenshots], warnings: finalWarnings };
}

export interface SonarCaptureResult {
  source: SonarSourceEvidence;
  navigation: SonarNavigation;
  screenshots: string[];
  warnings: string[];
}

/** Capture SonarQube only through the visible home → overall → issues flow. */
export async function captureSonarqubeEvidence(input: {
  page: Page;
  project: NormalizedProjectConfig;
  deadline: WorkflowDeadline;
  outputDirectory: string;
  terminalBuildUrl?: string;
}): Promise<SonarCaptureResult> {
  let capturePage: Page | undefined;
  let routeHandler: ReturnType<typeof createRouteHandler> | undefined;
  const warnings: string[] = [];
  const captures: CaptureMetadata[] = [];
  const screenshots: string[] = [];
  let facets: SonarSourceEvidence['facets'];
  let navigation: SonarNavigation = {
    'sonarqube-home': sonarNavigation('sonarqube-home', 'incomplete'),
    'sonarqube-overall': sonarNavigation('sonarqube-overall', 'incomplete'),
    'sonarqube-issues': sonarNavigation('sonarqube-issues', 'incomplete'),
  };
  try {
    const terminalUrl = assertAllowedUrl(input.page.url(), input.project.baseUrl, [input.project.sourceOrigins.jenkins], 'Jenkins terminal URL');
    if (input.terminalBuildUrl !== undefined) {
      const expected = assertAllowedUrl(input.terminalBuildUrl, input.project.baseUrl, [input.project.sourceOrigins.jenkins], 'terminal build URL');
      if (terminalIdentity(terminalUrl) !== terminalIdentity(expected)) throw new Error('SonarQube capture did not start from the exact terminal Jenkins build');
    }
    const links = await pageLinkCandidates(input.page);
    const classified = classifySonarLinks(links, input.project);
    warnings.push(...classified.warnings);
    if (classified.home === undefined) return emptyResult(warnings.length === 0 ? 'not_found' : 'incomplete', warnings);
    const allowArchivedSnapshot = isArchivedSonarqubeSnapshot(new URL(classified.home.href));
    const expectedKey = projectKeyFromHome(classified.home.href, input.project);
    capturePage = await input.page.context().newPage();
    await capturePage.setViewportSize(SONAR_VIEWPORT);
    const routeState = { blocked: false };
    routeHandler = createRouteHandler(input.project, routeState);
    await capturePage.route('**/*', routeHandler);
    const response = await capturePage.goto(classified.home.href, { waitUntil: 'domcontentloaded', timeout: input.deadline.requireRemaining() });
    if (routeState.blocked) throw new Error('SonarQube request was blocked by the configured origin policy');
    if (response !== null && response.status() >= 400) throw new Error(`SonarQube home returned HTTP ${response.status()}`);
    assertProjectUrl(
      assertAllowedUrl(capturePage.url(), input.project.baseUrl, input.project.sourceOrigins.sonarqube, 'SonarQube home URL'),
      expectedKey,
      'home',
      allowArchivedSnapshot,
    );
    const homeStrategy = await assertHomeIdentity(capturePage, expectedKey, input.deadline, input.project.name, allowArchivedSnapshot);
    const validatedHomeUrl = assertProjectUrl(
      assertAllowedUrl(capturePage.url(), input.project.baseUrl, input.project.sourceOrigins.sonarqube, 'SonarQube Overview URL'),
      expectedKey,
      'Overview',
      allowArchivedSnapshot,
    );
    captures.push(await pageCaptureMetadata(capturePage, validatedHomeUrl, homeStrategy));
    navigation = { ...navigation, 'sonarqube-home': sonarNavigation('sonarqube-home', 'found', validatedHomeUrl) };

    try {
      const overall = await captureOverallStep({ page: capturePage, project: input.project, expectedKey, deadline: input.deadline, outputDirectory: input.outputDirectory, allowArchivedSnapshot });
      captures.push(overall.capture);
      if (overall.screenshot !== undefined) screenshots.push(overall.screenshot);
      warnings.push(...overall.warnings);
      navigation = { ...navigation, 'sonarqube-overall': overall.navigation };
    } catch (error) {
      warnings.push(`SonarQube Overall capture failed: ${captureFailureMessage(error)}`);
      return finalize(captures, navigation, screenshots, warnings);
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
    }
    return finalize(captures, navigation, screenshots, warnings, facets);
  } catch (error) {
    warnings.push(captureFailureMessage(error));
    return finalize(captures, navigation, screenshots, warnings, facets);
  } finally {
    if (capturePage !== undefined) {
      if (routeHandler !== undefined) await capturePage.unroute('**/*', routeHandler).catch(() => undefined);
      await capturePage.close().catch(() => undefined);
    }
  }
}
