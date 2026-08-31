import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import type { JenkinsRunnerConfig } from './runner-config.js';
import { settleCleanup, WorkflowDeadline, withWorkflowDeadline, withWorkflowDeadlineAndLateResource } from '../workflow/workflow-deadline.js';
import { locatorFor } from './locators.js';
import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import { isExactJobUrl, normalizedPathname, validateJenkinsUrl } from './url-identity.js';

export interface JenkinsSession {
  context: BrowserContext;
  page: Page;
  deadline: WorkflowDeadline;
}

function isExactConfiguredUrl(candidateUrl: string, configuredUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const configured = new URL(configuredUrl);
    return candidate.origin === configured.origin &&
      candidate.search === configured.search &&
      candidate.hash === configured.hash &&
      normalizedPathname(candidateUrl) === normalizedPathname(configuredUrl);
  } catch {
    return false;
  }
}

function decodedPathname(value: string): string {
  let decoded = normalizedPathname(value);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) return decoded;
    decoded = next;
  }
  return decoded;
}

function loginPathname(config: JenkinsRunnerConfig): string {
  return normalizedPathname(config.loginUrl);
}

function isLoginLocation(config: JenkinsRunnerConfig, currentUrl: string): boolean {
  let pathname: string;
  try {
    pathname = decodedPathname(currentUrl).toLowerCase();
  } catch {
    return true;
  }
  const loginPath = loginPathname(config).toLowerCase();
  const basePath = normalizedPathname(config.baseUrl).toLowerCase();
  const loginLikePath = /(?:^|\/)(?:login|loginerror|signin|sign-in|authenticate|auth|sso|oauth2?|authorize|security|securityrealm|security-realm|security_realm|error|denied|unauthorized|forbidden)(?:$|\/)/u;
  return (
    pathname === loginPath ||
    pathname === `${basePath}/loginerror` ||
    loginLikePath.test(pathname) ||
    pathname.endsWith('/j_spring_security_check') ||
    pathname.endsWith('/j_acegi_security_check')
  );
}

function decodeJobSegment(value: string): string {
  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return decoded;
    }
  }
  return decoded;
}

function configuredJobName(jobUrl: string): string {
  const segments = new URL(jobUrl).pathname.split('/').filter(Boolean);
  const jobIndex = segments.findLastIndex((segment) => segment === 'job');
  const rawName = jobIndex >= 0
    ? segments[jobIndex + 1]
    : segments.at(-1);
  return rawName === undefined ? '' : decodeJobSegment(rawName);
}

async function assertLoginFormAction(page: Page, config: JenkinsRunnerConfig, deadline: WorkflowDeadline): Promise<void> {
  const form = page.getByLabel('Username').locator('xpath=ancestor::form[1]');
  await expect(form).toHaveCount(1, { timeout: deadline.requireRemaining() });
  const method = (await form.getAttribute('method') ?? 'get').trim().toLowerCase();
  if (method !== 'post') throw new JenkinsFlowError('Jenkins login form must submit with POST');
  const rawAction = await form.getAttribute('action');
  let action: URL;
  try {
    action = new URL(rawAction ?? page.url(), page.url());
    validateJenkinsUrl(action.toString(), config.baseUrl);
  } catch {
    throw new JenkinsFlowError('Jenkins login form action is not an allowed authentication endpoint');
  }
  const basePath = normalizedPathname(config.baseUrl);
  const allowedSecurityPaths = new Set([
    `${basePath}/j_spring_security_check`,
    `${basePath}/j_acegi_security_check`,
  ]);
  if (!isExactConfiguredUrl(action.toString(), config.loginUrl) &&
    (action.search !== '' || action.hash !== '' || !allowedSecurityPaths.has(normalizedPathname(action.toString())))) {
    throw new JenkinsFlowError('Jenkins login form action is not an allowed authentication endpoint');
  }
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
    if (!isExactConfiguredUrl(page.url(), loginUrl)) {
      throw new JenkinsFlowError('Jenkins login navigation changed the configured login URL');
    }
    await expect(page.getByLabel('Username')).toBeVisible({ timeout: deadline.requireRemaining() });
    await assertLoginFormAction(page, config, deadline);
    await page.getByLabel('Username').fill(config.username, { timeout: deadline.requireRemaining() });
    await page.getByLabel('Password').fill(config.password, { timeout: deadline.requireRemaining() });
    const redirected = page.waitForURL(
      (url) => !isLoginLocation(config, url.toString()) && (() => {
        try {
          validateJenkinsUrl(url.toString(), config.baseUrl);
          return true;
        } catch {
          return false;
        }
      })(),
      {
        waitUntil: 'domcontentloaded',
        timeout: deadline.requireRemaining(),
      },
    );
    await page.getByRole('button', { name: /sign in/i }).click({ timeout: deadline.requireRemaining() });
    await redirected;
    validateJenkinsUrl(page.url(), config.baseUrl);
    if (isLoginLocation(config, page.url())) {
      throw new JenkinsFlowError('Jenkins login remained on the login endpoint');
    }

    const landmark = locatorFor(page, config.selectors.authLandmark);
    await expect(landmark).toBeVisible({ timeout: deadline.requireRemaining() });
  } catch (error) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Jenkins login failed', error, config, page, loginUrl),
    );
  }
}

/** Open the configured Jenkins job without build triggering or polling. */
export async function openJenkinsJob(
  page: Page,
  config: JenkinsRunnerConfig,
  deadline: WorkflowDeadline,
): Promise<string> {
  try {
    const response = await page.goto(config.jobUrl, {
      waitUntil: 'domcontentloaded',
      timeout: deadline.requireRemaining(),
    });
    if (response === null || (response !== undefined && !response.ok())) {
      throw new JenkinsFlowError(`Jenkins job navigation returned HTTP ${response?.status() ?? 'no response'}`);
    }
    validateJenkinsUrl(page.url(), config.baseUrl);
    if (!isExactJobUrl(page.url(), config.jobUrl)) {
      throw new JenkinsFlowError('Jenkins job navigation changed the configured job URL');
    }

    const jobName = configuredJobName(config.jobUrl);
    const heading = page.getByRole('heading', { name: jobName, exact: true }).first();
    if (jobName.length > 0 && await heading.count() > 0) {
      await expect(heading).toBeVisible({ timeout: deadline.requireRemaining() });
    } else {
      await expect(page.locator('#jenkins').first()).toBeVisible({
        timeout: deadline.requireRemaining(),
      });
    }
    return page.url();
  } catch (error) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Jenkins job navigation failed', error, config, page, config.jobUrl),
    );
  }
}


async function closeContextAfterFailure(context: BrowserContext): Promise<void> {
  await settleCleanup(() => context.close());
}

/** Create an ephemeral Jenkins context and close it if login submission fails. */
export async function createJenkinsSession(
  browser: Browser,
  config: JenkinsRunnerConfig,
  deadline = new WorkflowDeadline(config.timeoutMs),
): Promise<JenkinsSession> {
  let context: BrowserContext | undefined;
  try {
    context = await withWorkflowDeadlineAndLateResource(
      () => browser.newContext(),
      deadline,
      closeContextAfterFailure,
    );
    const page = await withWorkflowDeadlineAndLateResource(
      () => context!.newPage(),
      deadline,
      (latePage) => settleCleanup(() => latePage.close()),
    );
    await submitJenkinsLogin(page, config, deadline);
    return { context, page, deadline };
  } catch (error) {
    if (context !== undefined) {
      await closeContextAfterFailure(context);
    }
    throw error;
  }
}
