import type { Page } from '@playwright/test';

import type { ProjectSecrets } from '../../config/config-types.js';
import { formatDiagnostic } from '../../config-errors.js';
import { withWorkflowDeadline, type WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import {
  firstAvailable,
  sonarLoginPasswordCandidates,
  sonarLoginSubmitCandidates,
  sonarLoginUsernameCandidates,
} from './sonarqube-locators.js';
import { hasCredentialFreeAuthority, isSonarqubeLoginLocation } from './sonarqube-url-identity.js';

export async function submitSonarqubeLogin(
  page: Page,
  secrets: ProjectSecrets,
  deadline: WorkflowDeadline,
): Promise<void> {
  try {
    const username = await firstAvailable(sonarLoginUsernameCandidates(page), deadline);
    await withWorkflowDeadline(
      () => username.locator.fill(secrets.username, { timeout: deadline.requireRemaining() }),
      deadline,
    );

    const password = await firstAvailable(sonarLoginPasswordCandidates(page), deadline);
    await withWorkflowDeadline(
      () => password.locator.fill(secrets.password, { timeout: deadline.requireRemaining() }),
      deadline,
    );

    const submit = await firstAvailable(sonarLoginSubmitCandidates(page), deadline);
    await withWorkflowDeadline(
      () => submit.locator.click({ timeout: deadline.requireRemaining() }),
      deadline,
    );

    const waitTimeout = Math.min(deadline.requireRemaining(), 10_000);
    await Promise.race([
      page.waitForURL(
        (url) => !isSonarqubeLoginLocation(url) && hasCredentialFreeAuthority(url),
        { waitUntil: 'domcontentloaded', timeout: waitTimeout },
      ).catch(() => undefined),
      page.waitForFunction(
        () => document.querySelector('#login-input, input[name="login"]') === null,
        undefined,
        { timeout: waitTimeout },
      ).catch(() => undefined),
    ]);

    if (isSonarqubeLoginLocation(new URL(page.url()))) {
      throw new Error('SonarQube login remained on the login endpoint');
    }
  } catch (error) {
    throw new Error(
      `SonarQube login failed: ${formatDiagnostic(error, [secrets.username, secrets.password])}`,
    );
  }
}
