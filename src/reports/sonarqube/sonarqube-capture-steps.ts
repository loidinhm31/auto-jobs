import { expect, type Locator, type Page } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../config/config-types.js';
import type { CaptureMetadata, NavigationTarget, NavigationTargets, SonarIssueFacets } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import { normalizeSonarIssueFacets } from './sonarqube-issue-facets.js';
import {
  facetCandidatesWithStatus,
  facetLocators,
  firstAvailable,
  issuesControlCandidates,
  overallControlCandidates,
  overallPanel,
  overviewCandidates,
  projectIdentityHrefCandidates,
  projectIdentityCandidates,
} from './sonarqube-locators.js';
import {
  captureFailureMessage,
  navigation,
  pageCaptureMetadata,
  screenshotFacetRange,
  screenshotRegion,
  SONAR_SCREENSHOTS,
} from './sonarqube-capture-support.js';

export type SonarNavigation = Pick<NavigationTargets, 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues'>;

export interface SonarStepInput {
  page: Page;
  project: NormalizedProjectConfig;
  expectedKey: string;
  deadline: WorkflowDeadline;
  outputDirectory: string;
}

export interface SonarStepResult {
  capture: CaptureMetadata;
  navigation: NavigationTarget;
  screenshot?: string;
  warnings: string[];
}

export interface SonarIssuesStepResult extends SonarStepResult {
  facets: SonarIssueFacets;
}

async function visible(locator: Locator, deadline: WorkflowDeadline, message: string): Promise<void> {
  try {
    await expect(locator).toBeVisible({ timeout: Math.min(deadline.requireRemaining(), 5_000) });
  } catch {
    throw new Error(message);
  }
}

async function waitForUrl(
  page: Page,
  expectedKey: string,
  deadline: WorkflowDeadline,
  kind: 'overall' | 'issues',
): Promise<void> {
  await expect.poll(async () => {
    try {
      const url = new URL(page.url());
      if (url.searchParams.get('id') !== expectedKey) return 'wrong-project';
      if (kind === 'overall') return url.searchParams.get('codeScope') === 'overall' ? kind : 'waiting';
      return /\/issues(?:\/|$)/iu.test(url.pathname) ? kind : 'waiting';
    } catch {
      return 'waiting';
    }
  }, { timeout: deadline.requireRemaining(), intervals: [50, 100, 250, 500] }).toBe(kind);
}

async function validatedUrl(input: SonarStepInput, label: 'overall' | 'issues'): Promise<string> {
  const value = assertAllowedUrl(input.page.url(), input.project.baseUrl, input.project.sourceOrigins.sonarqube, `SonarQube ${label} URL`);
  const url = new URL(value);
  if (url.searchParams.get('id') !== input.expectedKey) throw new Error(`SonarQube ${label} has the wrong project identity`);
  if (/\/login(?:\/|$)/iu.test(url.pathname)) throw new Error(`SonarQube ${label} redirected to login`);
  return value;
}

export async function captureOverallStep(input: SonarStepInput): Promise<SonarStepResult> {
  const control = await firstAvailable(overallControlCandidates(input.page));
  await visible(control.locator, input.deadline, 'SonarQube Overall Code control was not visible');
  await control.locator.click({ timeout: input.deadline.requireRemaining() });
  await waitForUrl(input.page, input.expectedKey, input.deadline, 'overall');
  const url = await validatedUrl(input, 'overall');
  const panel = await overallPanel(input.page);
  await visible(panel, input.deadline, 'SonarQube Overall panel was not visible');
  const capture = await pageCaptureMetadata(input.page, url, control.strategy);
  try {
    const screenshot = await screenshotRegion(input.page, panel, input.outputDirectory, SONAR_SCREENSHOTS.overall, input.deadline);
    return {
      capture: { ...capture, ...screenshot },
      navigation: navigation('sonarqube-overall', 'found', url),
      screenshot: SONAR_SCREENSHOTS.overall,
      warnings: [],
    };
  } catch (error) {
    return {
      capture,
      navigation: navigation('sonarqube-overall', 'incomplete', url),
      warnings: [`SonarQube Overall screenshot capture failed: ${captureFailureMessage(error)}`],
    };
  }
}

export async function captureIssuesStep(input: SonarStepInput): Promise<SonarIssuesStepResult> {
  const control = await firstAvailable(await issuesControlCandidates(input.page, input.expectedKey));
  await visible(control.locator, input.deadline, 'SonarQube Issues control was not visible');
  await control.locator.click({ timeout: input.deadline.requireRemaining() });
  await waitForUrl(input.page, input.expectedKey, input.deadline, 'issues');
  const url = await validatedUrl(input, 'issues');
  const baseCapture = await pageCaptureMetadata(input.page, url, control.strategy);
  const emptyFacets: SonarIssueFacets = { types: [], severities: [] };
  let identityStrategy: string;
  try {
    identityStrategy = await assertRenderedProjectIdentity(input.page, input.expectedKey, input.deadline, input.project.name, 'issues');
  } catch (error) {
    return {
      capture: baseCapture,
      navigation: navigation('sonarqube-issues', 'incomplete', url),
      facets: emptyFacets,
      warnings: [`SonarQube Issues project identity validation failed: ${captureFailureMessage(error)}`],
    };
  }
  const capture = { ...baseCapture, selectorStrategy: `${control.strategy};identity=${identityStrategy}` };
  let typeFacet: Awaited<ReturnType<typeof facetLocators>>;
  let severityFacet: Awaited<ReturnType<typeof facetLocators>>;
  try {
    typeFacet = await facetLocators(input.page, 'types', 'Type');
    severityFacet = await facetLocators(input.page, 'severities', 'Severity');
    await visible(typeFacet.header, input.deadline, 'SonarQube Type facet was not visible');
    await visible(severityFacet.header, input.deadline, 'SonarQube Severity facet was not visible');
    for (const facet of [typeFacet, severityFacet]) {
      if (await facet.header.getAttribute('aria-expanded') !== 'true') {
        await facet.header.click({ timeout: input.deadline.requireRemaining() });
        await expect(facet.header).toHaveAttribute('aria-expanded', 'true', { timeout: input.deadline.requireRemaining() });
      }
    }
  } catch (error) {
    return {
      capture,
      navigation: navigation('sonarqube-issues', 'incomplete', url),
      facets: emptyFacets,
      warnings: [`SonarQube Type/Severity facet capture failed: ${captureFailureMessage(error)}`],
    };
  }

  const typeExtraction = await facetCandidatesWithStatus(typeFacet, 'types');
  const severityExtraction = await facetCandidatesWithStatus(severityFacet, 'severities');
  const normalized = normalizeSonarIssueFacets({ types: typeExtraction.values, severities: severityExtraction.values });
  const warnings = [...normalized.warnings];
  if (typeExtraction.truncated) warnings.push(`SonarQube Type facets were capped at ${typeExtraction.values.length} items`);
  if (severityExtraction.truncated) warnings.push(`SonarQube Severity facets were capped at ${severityExtraction.values.length} items`);
  if (typeExtraction.values.length === 0 || severityExtraction.values.length === 0) {
    warnings.push('SonarQube Type/Severity facet evidence was not found');
  }

  let screenshot: string | undefined;
  let screenshotMetadata: Awaited<ReturnType<typeof screenshotFacetRange>> | undefined;
  try {
    await visible(typeFacet.container, input.deadline, 'SonarQube Type facet region was not visible');
    await visible(severityFacet.container, input.deadline, 'SonarQube Severity facet region was not visible');
    screenshotMetadata = await screenshotFacetRange(
      input.page,
      typeFacet.container,
      severityFacet.container,
      input.outputDirectory,
      SONAR_SCREENSHOTS.issues,
      input.deadline,
    );
    screenshot = SONAR_SCREENSHOTS.issues;
  } catch (error) {
    warnings.push(`SonarQube Issues screenshot capture failed: ${captureFailureMessage(error)}`);
  }

  return {
    capture: { ...capture, selectorStrategy: `${capture.selectorStrategy};type=${typeFacet.strategy};severity=${severityFacet.strategy}`, ...screenshotMetadata },
    navigation: navigation('sonarqube-issues', warnings.length === 0 ? 'found' : 'incomplete', url),
    ...(screenshot === undefined ? {} : { screenshot }),
    facets: normalized.facets,
    warnings: [...new Set(warnings)],
  };
}

export async function assertHomeIdentity(
  page: Page,
  expectedKey: string,
  deadline: WorkflowDeadline,
  displayName?: string,
): Promise<string> {
  const identityStrategy = await assertRenderedProjectIdentity(page, expectedKey, deadline, displayName, 'home');
  const overview = await firstAvailable(overviewCandidates(page));
  await visible(overview.locator, deadline, 'SonarQube Overview project header was not visible');
  if (overview.strategy !== 'role:link:Overview') throw new Error('SonarQube Overview navigation control was not actionable');
  await overview.locator.click({ timeout: deadline.requireRemaining() });
  return `${identityStrategy};${overview.strategy}`;
}

export async function assertRenderedProjectIdentity(
  page: Page,
  expectedKey: string,
  deadline: WorkflowDeadline,
  displayName?: string,
  label: 'home' | 'issues' = 'home',
): Promise<string> {
  const identity = await firstAvailable([
    ...(await projectIdentityHrefCandidates(page, expectedKey)),
    ...projectIdentityCandidates(page, expectedKey, displayName),
  ]);
  await visible(identity.locator, deadline, `SonarQube ${label} project identity was not visible`);
  return identity.strategy;
}
