import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import {
  resolveBasePathUrl,
  type RunnerConfig,
} from '../config.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { pollUntil } from '../workflow/poll-until.js';
import { locatorFor } from './locators.js';
import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import { resolveJenkinsJob } from './job.js';
import { validateJenkinsUrl } from './url-identity.js';

export interface AuthenticatedSession {
  context: BrowserContext;
  page: Page;
  deadline: WorkflowDeadline;
}

function loginPathname(config: RunnerConfig): string {
  return new URL(
    resolveBasePathUrl(config.baseUrl, config.loginPath),
  ).pathname;
}

function isLoginLocation(config: RunnerConfig, currentUrl: string): boolean {
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

/** Log in through Jenkins' form UI without persisting storage state. */
export async function loginToJenkins(
  page: Page,
  config: RunnerConfig,
  deadline: WorkflowDeadline,
): Promise<void> {
  const loginUrl = resolveBasePathUrl(config.baseUrl, config.loginPath);

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: deadline.requireRemaining() });
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
      return;
    }
    await resolveJenkinsJob(page, config, deadline);
  } catch (error) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Jenkins login failed', error, config, page, loginUrl),
    );
  }
}

/** Create an ephemeral context and close it if authentication fails. */
export async function createAuthenticatedSession(
  browser: Browser,
  config: RunnerConfig,
  deadline = new WorkflowDeadline(config.timeoutMs),
): Promise<AuthenticatedSession> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginToJenkins(page, config, deadline);
    return { context, page, deadline };
  } catch (error) {
    await context.close();
    throw error;
  }
}
