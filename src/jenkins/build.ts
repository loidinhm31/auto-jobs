import { type Page } from '@playwright/test';

import { type RunnerConfig } from '../config.js';
import type { BuildReference, QueueReference } from '../types.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { pollUntil } from '../workflow/poll-until.js';
import { formatJenkinsFailure, formatJenkinsObservation, JenkinsFlowError } from './errors.js';
import { type JenkinsJobReference } from './job.js';
import { locatorFor, readAllHrefs, readFirstHref } from './locators.js';
import { parseBuildReference, parseQueueReference, validateJenkinsUrl } from './url-identity.js';

export interface TerminalBuildResult {
  build: BuildReference;
  status: string;
  observedAt: string;
  observationErrors: readonly string[];
  reloadCount: number;
}

function sameBuild(left: BuildReference, right: BuildReference): boolean {
  return left.number === right.number && left.url === right.url;
}

async function gotoSuccessful(
  page: Page,
  url: string,
  deadline: WorkflowDeadline,
): Promise<void> {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: deadline.requireRemaining(),
  });
  if (response === null || !response.ok()) {
    throw new JenkinsFlowError(`Jenkins navigation returned HTTP ${response?.status() ?? 'no response'}`);
  }
}

async function reloadSuccessful(page: Page, deadline: WorkflowDeadline): Promise<void> {
  const response = await page.reload({
    waitUntil: 'domcontentloaded',
    timeout: deadline.requireRemaining(),
  });
  if (response === null || !response.ok()) {
    throw new JenkinsFlowError(`Jenkins reload returned HTTP ${response?.status() ?? 'no response'}`);
  }
}

async function assertCurrentBuildIdentity(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  expected: BuildReference,
  deadline: WorkflowDeadline,
): Promise<void> {
  deadline.requireRemaining();
  const current = parseBuildReference(page.url(), config.baseUrl, job.url);
  if (current === undefined || !sameBuild(current, expected)) {
    throw new JenkinsFlowError('Jenkins navigation did not preserve the requested exact build URL');
  }
  const reportedUrl = await readFirstHref(locatorFor(page, config.selectors.buildUrl), page);
  const reported = reportedUrl === undefined
    ? undefined
    : parseBuildReference(reportedUrl, config.baseUrl, job.url);
  if (reported === undefined || !sameBuild(reported, expected)) {
    throw new JenkinsFlowError('Jenkins build page did not expose the requested exact build identity');
  }
}

export async function openExistingBuild(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  deadline: WorkflowDeadline,
): Promise<BuildReference> {
  if (config.buildNumber === undefined) {
    throw new JenkinsFlowError('existing build mode requires a configured build number');
  }
  const requested: BuildReference = {
    number: config.buildNumber,
    url: new URL(`${config.buildNumber}/`, job.url).toString(),
  };
  try {
    await gotoSuccessful(page, requested.url, deadline);
    validateJenkinsUrl(page.url(), config.baseUrl);
    await assertCurrentBuildIdentity(page, config, job, requested, deadline);
    return requested;
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure(
      'Jenkins existing build selection failed', error, config, page, requested.url,
    ));
  }
}

/** Follows one already-correlated queue item until its configured build reference appears. */
export async function resolveQueuedBuild(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  queue: QueueReference,
  baselineBuildNumber: number | undefined,
  deadline: WorkflowDeadline,
): Promise<BuildReference> {
  let reloadCount = 0;
  const observationErrors: string[] = [];
  try {
    await gotoSuccessful(page, queue.url, deadline);
    const currentQueue = parseQueueReference(page.url(), config.baseUrl);
    if (currentQueue?.id !== queue.id) throw new JenkinsFlowError('Jenkins queue navigation lost the correlated queue identity');
    const result = await pollUntil<BuildReference>({
      deadline,
      intervalMs: config.pollIntervalMs,
      observe: async () => {
        try {
          const hrefs = await readAllHrefs(locatorFor(page, config.selectors.buildUrl), page);
          const build = hrefs
            .map((href) => parseBuildReference(href, config.baseUrl, job.url))
            .find((candidate): candidate is BuildReference =>
              candidate !== undefined && candidate.number > (baselineBuildNumber ?? 0));
          if (build !== undefined) return build;
          if (reloadCount === 0) {
            reloadCount += 1;
            await reloadSuccessful(page, deadline);
          }
          return undefined;
        } catch (error) {
          observationErrors.push(formatJenkinsObservation(error, config));
          throw error;
        }
      },
      accept: () => true,
    });
    return result.value;
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure(
      'Jenkins queue-to-build correlation failed', error, config, page, queue.url, observationErrors,
    ));
  }
}

function isTerminalStatus(status: string): boolean {
  return /\b(?:success|failure|unstable|aborted|not built)\b/iu.test(status);
}

/** Navigates to and proves the exact build page before polling its terminal status. */
export async function waitForTerminalBuild(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  build: BuildReference,
  deadline: WorkflowDeadline,
): Promise<TerminalBuildResult> {
  const observationErrors: string[] = [];
  let reloadCount = 0;
  try {
    await gotoSuccessful(page, build.url, deadline);
    await assertCurrentBuildIdentity(page, config, job, build, deadline);
    const result = await pollUntil<string>({
      deadline,
      intervalMs: config.pollIntervalMs,
      observe: async () => {
        try {
          await assertCurrentBuildIdentity(page, config, job, build, deadline);
          const status = await locatorFor(page, config.selectors.buildStatus).textContent();
          if (status === null || status.trim() === '') throw new Error('Jenkins build status was not readable');
          if (!isTerminalStatus(status) && reloadCount === 0) {
            reloadCount += 1;
            await reloadSuccessful(page, deadline);
          }
          return status.trim();
        } catch (error) {
          observationErrors.push(formatJenkinsObservation(error, config));
          if (reloadCount === 0) {
            reloadCount += 1;
            await reloadSuccessful(page, deadline);
          }
          throw error;
        }
      },
      accept: isTerminalStatus,
    });
    return { build, status: result.value, observedAt: new Date().toISOString(), observationErrors, reloadCount };
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure(
      'Jenkins build did not reach a terminal state', error, config, page, build.url, observationErrors,
    ));
  }
}
