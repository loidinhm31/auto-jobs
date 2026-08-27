import { expect, type Locator, type Page } from '@playwright/test';

import type { NavigationTargets } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import {
  firstAvailable,
  overallControlCandidates,
  overallPanel,
  overviewCandidates,
} from './sonarqube-locators.js';
import {
  captureFailureMessage,
  navigation,
  pageCaptureMetadata,
  screenshotRegion,
  SONAR_SCREENSHOTS,
} from './sonarqube-capture-support.js';
import {
  assertRenderedProjectIdentity,
  captureIssuesStep,
} from './sonarqube-issues-capture-step.js';
import { exactQueryValue, hasCredentialFreeAuthority } from './sonarqube-url-identity.js';

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

export type SonarNavigation = Pick<NavigationTargets, 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues'>;

async function visible(locator: Locator, deadline: WorkflowDeadline, message: string): Promise<void> {
  try {
    await expect(locator).toBeVisible({ timeout: Math.min(deadline.requireRemaining(), 5_000) });
  } catch {
    throw new Error(message);
  }
}

async function waitForOverallUrl(page: Page, expectedKey: string, deadline: WorkflowDeadline): Promise<string> {
  await expect.poll(() => {
    try {
      const url = new URL(page.url());
      return hasCredentialFreeAuthority(url) && exactQueryValue(url, 'id') === expectedKey && exactQueryValue(url, 'codeScope') === 'overall';
    } catch {
      return false;
    }
  }, { timeout: deadline.requireRemaining(), intervals: [50, 100, 250, 500] }).toBe(true);
  return page.url();
}

function validatedStepUrl(input: SonarStepInput, value: string, label: 'overall'): string {
  const url = assertAllowedUrl(
    value,
    input.project.baseUrl,
    input.project.sourceOrigins.sonarqube,
    `SonarQube ${label} URL`,
  );
  const parsed = new URL(url);
  if (!hasCredentialFreeAuthority(parsed) || exactQueryValue(parsed, 'id') !== input.expectedKey) throw new Error(`SonarQube ${label} has the wrong project identity`);
  if (/\/login(?:\/|$)/iu.test(parsed.pathname)) throw new Error(`SonarQube ${label} redirected to login`);
  return url;
}

export async function captureOverallStep(input: SonarStepInput): Promise<SonarStepResult> {
  const control = await firstAvailable(
    overallControlCandidates(input.page, input.expectedKey, input.project.name, input.allowArchivedSnapshot),
    input.deadline,
  );
  await visible(control.locator, input.deadline, 'SonarQube Overall Code control was not visible');
  await control.locator.click({ timeout: input.deadline.requireRemaining() });
  const url = validatedStepUrl(input, await waitForOverallUrl(input.page, input.expectedKey, input.deadline), 'overall');
  const panel = await overallPanel(input.page, input.deadline);
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
  await overview.locator.click({ timeout: deadline.requireRemaining() });
  return `${identityStrategy};${overview.strategy}`;
}
