import { expect, type Page } from '@playwright/test';

import type { JenkinsRunnerConfig } from './runner-config.js';
import type { BuildReference } from '../types.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import { locatorFor, readAllHrefs } from './locators.js';
import { isExactJobUrl, parseBuildReference, validateJenkinsUrl } from './url-identity.js';

export interface JenkinsJobReference {
  name: string;
  path: string;
  url: string;
  lastObservedBuildNumber?: number;
}

function usesDefaultBuildUrlSelector(config: JenkinsRunnerConfig): boolean {
  const selector = config.selectors.buildUrl;
  return selector.kind === 'testId' && selector.value === 'jenkins-build-url';
}

function configuredJobName(jobUrl: string): string {
  const segment = new URL(jobUrl).pathname.split('/').filter(Boolean).at(-1);
  return decodeURIComponent(segment ?? jobUrl);
}

export function pagePath(url: string): string {
  return new URL(url).pathname.replace(/\/+$/u, '');
}

export function buildNumberFromUrl(
  jobUrl: string,
  candidateUrl: string,
): number | undefined {
  const jobPathname = pagePath(jobUrl);
  const candidatePathname = pagePath(candidateUrl);
  const prefix = `${jobPathname}/`;
  if (!candidatePathname.startsWith(prefix)) return undefined;
  const suffix = candidatePathname.slice(prefix.length);
  return /^\d+$/u.test(suffix) ? Number(suffix) : undefined;
}

export async function latestBuildNumber(
  page: Page,
  config: JenkinsRunnerConfig,
  jobUrl: string,
  deadline: WorkflowDeadline,
): Promise<number | undefined> {
  deadline.requireRemaining();
  let hrefs = await readAllHrefs(locatorFor(page, config.selectors.buildUrl), page);
  if (hrefs.length === 0 && usesDefaultBuildUrlSelector(config)) {
    hrefs = await readAllHrefs(page.locator('a[href]'), page);
  }
  const numbers = hrefs
    .map((href) => parseBuildReference(href, config.baseUrl, jobUrl)?.number)
    .filter((number): number is number => number !== undefined);
  deadline.requireRemaining();
  return numbers.length === 0 ? undefined : Math.max(...numbers);
}

export function buildReference(
  job: JenkinsJobReference,
  number: number,
): BuildReference {
  return {
    number,
    url: new URL(`${number}/`, job.url).toString(),
  };
}

export async function resolveJenkinsJob(
  page: Page,
  config: JenkinsRunnerConfig,
  deadline: WorkflowDeadline,
): Promise<JenkinsJobReference> {
  const jobUrl = config.jobUrl;
  const name = configuredJobName(jobUrl);
  try {
    const response = await page.goto(jobUrl, {
      waitUntil: 'domcontentloaded',
      timeout: deadline.requireRemaining(),
    });
    if (response === null || (response !== undefined && !response.ok())) {
      throw new JenkinsFlowError(`Jenkins job navigation returned HTTP ${response?.status() ?? 'no response'}`);
    }
    validateJenkinsUrl(page.url(), config.baseUrl);
    if (!isExactJobUrl(page.url(), jobUrl)) {
      throw new JenkinsFlowError('Jenkins navigation did not resolve the configured exact job URL');
    }
    await expect(page).toHaveURL(jobUrl, {
      timeout: deadline.requireRemaining(),
    });
    await expect(
      page.getByRole('heading', { name, exact: true }).first(),
    ).toBeVisible({ timeout: deadline.requireRemaining() });

    const lastObservedBuildNumber = await latestBuildNumber(page, config, jobUrl, deadline);
    const job: JenkinsJobReference = { name, path: pagePath(jobUrl), url: jobUrl };
    if (lastObservedBuildNumber !== undefined) {
      job.lastObservedBuildNumber = lastObservedBuildNumber;
    }
    return job;
  } catch (error) {
    throw new JenkinsFlowError(
      formatJenkinsFailure(
        'Jenkins job resolution failed',
        error,
        config,
        page,
        jobUrl,
      ),
    );
  }
}

export function selectExistingBuild(
  job: JenkinsJobReference,
  config: JenkinsRunnerConfig,
): BuildReference | undefined {
  return config.buildNumber === undefined
    ? undefined
    : buildReference(job, config.buildNumber);
}
