import { expect, type Locator } from '@playwright/test';

import type { SonarIssueFacets } from '../../result-types.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import type { SonarIssuesStepResult, SonarStepInput } from './sonarqube-capture-step-types.js';
import {
  facetCandidatesWithStatus,
  facetLocators,
  firstAvailable,
  issuesControlCandidates,
  projectIdentityCandidates,
  projectIdentityHrefCandidates,
} from './sonarqube-locators.js';
import { normalizeSonarIssueFacets } from './sonarqube-issue-facets.js';
import {
  captureFailureMessage,
  navigation,
  pageCaptureMetadata,
  screenshotFacetRange,
  SONAR_SCREENSHOTS,
  assertSonarqubeUrlMatchesBuild,
} from './sonarqube-capture-support.js';
import { exactQueryValue, hasCredentialFreeAuthority } from './sonarqube-url-identity.js';

async function visible(locator: Locator, input: SonarStepInput, message: string): Promise<void> {
  try {
    await expect(locator).toBeVisible({ timeout: Math.min(input.deadline.requireRemaining(), 5_000) });
  } catch {
    throw new Error(message);
  }
}

async function prepareFacet(
  input: SonarStepInput,
  property: 'types' | 'severities',
  label: 'Type' | 'Severity',
): Promise<Awaited<ReturnType<typeof facetLocators>>> {
  const facet = await facetLocators(input.page, property, label, input.deadline);
  await visible(facet.header, input, `SonarQube ${label} facet was not visible`);
  const expanded = await facet.header.getAttribute('aria-expanded');
  if (expanded !== null && expanded !== 'true') {
    await facet.header.click({ timeout: input.deadline.requireRemaining() });
    await expect(facet.header).toHaveAttribute('aria-expanded', 'true', {
      timeout: input.deadline.requireRemaining(),
    });
  }
  return facet;
}

export async function assertRenderedProjectIdentity(
  page: SonarStepInput['page'],
  expectedKey: string,
  deadline: SonarStepInput['deadline'],
  displayName?: string,
  label: 'home' | 'issues' = 'home',
): Promise<string> {
  const identity = await firstAvailable(async () => [
    ...(await projectIdentityHrefCandidates(page, expectedKey)),
    ...projectIdentityCandidates(page, expectedKey, displayName),
  ], deadline);
  await expect(identity.locator).toBeVisible({
    timeout: Math.min(deadline.requireRemaining(), 5_000),
  }).catch(() => {
    throw new Error(`SonarQube ${label} project identity was not visible`);
  });
  return identity.strategy;
}

export async function captureIssuesStep(input: SonarStepInput): Promise<SonarIssuesStepResult> {
  const control = await firstAvailable(
    () => issuesControlCandidates(input.page, input.expectedKey, input.allowArchivedSnapshot),
    input.deadline,
  );
  await visible(control.locator, input, 'SonarQube Issues control was not visible');
  await control.locator.click({ timeout: input.deadline.requireRemaining() });
  await expect.poll(() => {
    try {
      const url = new URL(input.page.url());
      return hasCredentialFreeAuthority(url) && exactQueryValue(url, 'id') === input.expectedKey &&
        (/\/issues(?:\/|$)/iu.test(url.pathname) ||
          (input.allowArchivedSnapshot && /\/artifact\/(?:[^/]+\/)*sonarqube\/issues\.html$/iu.test(url.pathname)));
    } catch {
      return false;
    }
  }, { timeout: input.deadline.requireRemaining(), intervals: [50, 100, 250, 500] }).toBe(true);
  const url = assertAllowedUrl(
    input.page.url(),
    deriveJenkinsBaseUrl(input.project.loginUrl, input.project.jobUrl),
    input.project.sourceOrigins.sonarqube,
    'SonarQube issues URL',
  );
  const parsedUrl = new URL(url);
  if (!hasCredentialFreeAuthority(parsedUrl) || exactQueryValue(parsedUrl, 'id') !== input.expectedKey) {
    throw new Error('SonarQube issues has the wrong project identity');
  }
  if (/\/login(?:\/|$)/iu.test(parsedUrl.pathname)) {
    throw new Error('SonarQube issues redirected to login');
  }
  assertSonarqubeUrlMatchesBuild(url, input.project, input.expectedBuild);
  const baseCapture = await pageCaptureMetadata(input.page, url, control.strategy);
  const emptyFacets: SonarIssueFacets = { types: [], severities: [] };
  let identityStrategy: string;
  try {
    identityStrategy = await assertRenderedProjectIdentity(
      input.page,
      input.expectedKey,
      input.deadline,
      input.project.name,
      'issues',
    );
  } catch (error) {
    return {
      capture: baseCapture,
      navigation: navigation('sonarqube-issues', 'incomplete', url),
      facets: emptyFacets,
      warnings: [`SonarQube Issues project identity validation failed: ${captureFailureMessage(error)}`],
    };
  }

  const capture = { ...baseCapture, selectorStrategy: `${control.strategy};identity=${identityStrategy}` };
  const warnings: string[] = [];
  let typeFacet: Awaited<ReturnType<typeof facetLocators>> | undefined;
  let severityFacet: Awaited<ReturnType<typeof facetLocators>> | undefined;
  try {
    typeFacet = await prepareFacet(input, 'types', 'Type');
  } catch (error) {
    warnings.push(`SonarQube Type facet capture failed: ${captureFailureMessage(error)}`);
  }
  try {
    severityFacet = await prepareFacet(input, 'severities', 'Severity');
  } catch (error) {
    warnings.push(`SonarQube Severity facet capture failed: ${captureFailureMessage(error)}`);
  }

  const typeExtraction = typeFacet === undefined
    ? { values: [], truncated: false }
    : await facetCandidatesWithStatus(typeFacet, 'types', input.deadline);
  const severityExtraction = severityFacet === undefined
    ? { values: [], truncated: false }
    : await facetCandidatesWithStatus(severityFacet, 'severities', input.deadline);
  const normalized = normalizeSonarIssueFacets({
    types: typeExtraction.values,
    severities: severityExtraction.values,
  });
  warnings.push(...normalized.warnings);
  if (typeExtraction.truncated) warnings.push(`SonarQube Type facets were capped at ${typeExtraction.values.length} items`);
  if (severityExtraction.truncated) warnings.push(`SonarQube Severity facets were capped at ${severityExtraction.values.length} items`);
  if (typeExtraction.values.length === 0) warnings.push('SonarQube Type facet evidence was not found');
  if (severityExtraction.values.length === 0) warnings.push('SonarQube Severity facet evidence was not found');

  let screenshot: string | undefined;
  let screenshotMetadata: Awaited<ReturnType<typeof screenshotFacetRange>> | undefined;
  if (typeFacet !== undefined && severityFacet !== undefined) {
    try {
      await visible(typeFacet.container, input, 'SonarQube Type facet region was not visible');
      await visible(severityFacet.container, input, 'SonarQube Severity facet region was not visible');
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
  } else {
    warnings.push('SonarQube Issues screenshot skipped because a Type/Severity facet was unavailable');
  }

  return {
    capture: {
      ...capture,
      selectorStrategy: [
        capture.selectorStrategy,
        typeFacet === undefined ? undefined : `type=${typeFacet.strategy}`,
        severityFacet === undefined ? undefined : `severity=${severityFacet.strategy}`,
      ].filter((value): value is string => value !== undefined).join(';'),
      ...screenshotMetadata,
    },
    navigation: navigation('sonarqube-issues', warnings.length === 0 ? 'found' : 'incomplete', url),
    ...(screenshot === undefined ? {} : { screenshot }),
    facets: normalized.facets,
    warnings: [...new Set(warnings)],
  };
}
