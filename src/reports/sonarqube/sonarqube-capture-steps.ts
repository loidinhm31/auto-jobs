import { expect, type Locator, type Page } from '@playwright/test';

import type { NavigationTargets } from '../../result-types.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import {
  firstAvailable,
  overallControlCandidates,
  overallPanel,
  overviewCandidates,
} from './sonarqube-locators.js';
import {
  assertProjectUrl,
  captureFailureMessage,
  dismissSonarqubeModals,
  navigation,
  pageCaptureMetadata,
  screenshotRegion,
  SONAR_SCREENSHOTS,
} from './sonarqube-capture-support.js';
import {
  assertRenderedProjectIdentity,
  captureIssuesStep,
} from './sonarqube-issues-capture-step.js';
export type {
  SonarIssuesStepResult,
  SonarStepInput,
  SonarStepResult,
} from './sonarqube-capture-step-types.js';
export { assertRenderedProjectIdentity, captureIssuesStep } from './sonarqube-issues-capture-step.js';
import type {
  SonarStepInput,
  SonarStepResult,
} from './sonarqube-capture-step-types.js';
import { exactQueryValue, hasCredentialFreeAuthority, isArchivedSonarqubeArtifact } from './sonarqube-url-identity.js';

export type SonarNavigation = Pick<NavigationTargets, 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues'>;

async function visible(locator: Locator, deadline: WorkflowDeadline, message: string): Promise<void> {
  try {
    await expect(locator).toBeVisible({ timeout: Math.min(deadline.requireRemaining(), 5_000) });
  } catch {
    throw new Error(message);
  }
}

function isOverallPath(url: URL, allowArchivedSnapshot: boolean): boolean {
  return (url.pathname === '/dashboard' || url.pathname === '/dashboard/') ||
    (allowArchivedSnapshot && isArchivedSonarqubeArtifact(url) && /\/sonarqube\/overall\.html$/iu.test(url.pathname));
}

async function waitForOverallUrl(
  page: Page,
  expectedKey: string,
  deadline: WorkflowDeadline,
  allowArchivedSnapshot: boolean,
): Promise<string> {
  await page.waitForURL((url) => {
    try {
      return hasCredentialFreeAuthority(url) &&
        isOverallPath(url, allowArchivedSnapshot) &&
        exactQueryValue(url, 'id') === expectedKey &&
        exactQueryValue(url, 'codeScope') === 'overall';
    } catch {
      return false;
    }
  }, { timeout: deadline.requireRemaining(), waitUntil: 'domcontentloaded' });
  return page.url();
}
function validatedStepUrl(
  input: SonarStepInput,
  value: string,
  label: 'overall',
  allowArchivedSnapshot: boolean,
): string {
  const url = assertAllowedUrl(
    value,
    deriveJenkinsBaseUrl(input.project.loginUrl, input.project.jobUrl),
    input.project.sourceOrigins.sonarqube,
    `SonarQube ${label} URL`,
  );
  return assertProjectUrl(url, input.expectedKey, 'Overall', allowArchivedSnapshot);
}

export async function captureOverallStep(input: SonarStepInput): Promise<SonarStepResult> {
  await dismissSonarqubeModals(input.page);
  const control = await firstAvailable(
    overallControlCandidates(input.page, input.expectedKey, input.project.name, input.allowArchivedSnapshot),
    input.deadline,
  );
  await visible(control.locator, input.deadline, 'SonarQube Overall Code control was not visible');
  await control.locator.click({ timeout: input.deadline.requireRemaining() });
  const url = validatedStepUrl(input, await waitForOverallUrl(input.page, input.expectedKey, input.deadline, input.allowArchivedSnapshot ?? false), 'overall', input.allowArchivedSnapshot ?? false);
  await dismissSonarqubeModals(input.page);
  const panel = await overallPanel(input.page, input.deadline);
  await visible(panel, input.deadline, 'SonarQube Overall panel was not visible');
  const capture = await pageCaptureMetadata(input.page, url, control.strategy, input.deadline);
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

export async function assertHomeIdentity(
  page: Page,
  expectedKey: string,
  deadline: WorkflowDeadline,
  displayName?: string,
  allowArchivedSnapshot = false,
): Promise<string> {
  const identityStrategy = await assertRenderedProjectIdentity(page, expectedKey, deadline, displayName, 'home');
  const overview = await firstAvailable(overviewCandidates(page, expectedKey, displayName, allowArchivedSnapshot), deadline);
  await visible(overview.locator, deadline, 'SonarQube Overview project header was not visible');
  if (!/;role:(?:link|button|tab):Overview$/u.test(overview.strategy)) {
    throw new Error('SonarQube Overview navigation control was not actionable');
  }
  return `${identityStrategy};${overview.strategy}`;
}
