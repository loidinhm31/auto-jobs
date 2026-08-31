import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import type { JenkinsRunnerConfig } from './runner-config.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { pollUntil } from '../workflow/poll-until.js';
import { locatorFor } from './locators.js';
import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import { validateJenkinsUrl } from './url-identity.js';

export interface JenkinsSession {
  context: BrowserContext;
  page: Page;
  deadline: WorkflowDeadline;
}

function loginPathname(config: JenkinsRunnerConfig): string {
  return new URL(config.loginUrl).pathname;
}

function isLoginLocation(config: JenkinsRunnerConfig, currentUrl: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(currentUrl).pathname;
  } catch {
    return true;
  }
  const loginPath = loginPathname(config);
  const basePath = new URL(config.baseUrl).pathname.replace(/\/+$/u, '');
  return (
    pathname === loginPath ||
    pathname === `${basePath}/loginError` ||
    pathname.endsWith('/j_spring_security_check') ||
    pathname.endsWith('/j_acegi_security_check')
  );
}

/** Submit Jenkins' login form without persisting storage state. */
export async function submitJenkinsLogin(
  page: Page,
  config: JenkinsRunnerConfig,
  deadline: WorkflowDeadline,
): Promise<void> {
  const loginUrl = config.loginUrl;

  try {
    const response = await page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: deadline.requireRemaining(),
    });
    if (response === null || (response !== undefined && !response.ok())) {
      throw new JenkinsFlowError(`Jenkins login navigation returned HTTP ${response?.status() ?? 'no response'}`);
    }
    validateJenkinsUrl(page.url(), config.baseUrl);
    await expect(page.getByLabel('Username')).toBeVisible({ timeout: deadline.requireRemaining() });
    await page.getByLabel('Username').fill(config.username, { timeout: deadline.requireRemaining() });
    await page.getByLabel('Password').fill(config.password, { timeout: deadline.requireRemaining() });
    await page.getByRole('button', { name: /sign in/i }).click({ timeout: deadline.requireRemaining() });
    await pollUntil<boolean>({
      deadline,
      intervalMs: config.pollIntervalMs,
      observe: async () => !isLoginLocation(config, page.url()),
      accept: Boolean,
    });
    validateJenkinsUrl(page.url(), config.baseUrl);

    const landmark = locatorFor(page, config.selectors.authLandmark);
    if (config.selectors.authLandmark.required) {
      await expect(landmark).toBeVisible({ timeout: deadline.requireRemaining() });
    }
  } catch (error) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Jenkins login failed', error, config, page, loginUrl),
    );
  }
}

/** Create an ephemeral Jenkins context and close it if login submission fails. */
export async function createJenkinsSession(
  browser: Browser,
  config: JenkinsRunnerConfig,
  deadline = new WorkflowDeadline(config.timeoutMs),
): Promise<JenkinsSession> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await submitJenkinsLogin(page, config, deadline);
    return { context, page, deadline };
  } catch (error) {
    await context.close();
    throw error;
  }
}
