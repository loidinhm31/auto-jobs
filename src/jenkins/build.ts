import { type APIResponse, type Page } from '@playwright/test';

import { type RunnerConfig } from '../config.js';
import type { BuildReference, QueueReference } from '../types.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { pollUntil } from '../workflow/poll-until.js';
import { pushDiagnostic } from '../workflow/diagnostics.js';
import { redactText } from '../config-errors.js';
import { formatJenkinsFailure, formatJenkinsObservation, JenkinsFlowError } from './errors.js';
import { type JenkinsJobReference } from './job.js';
import { locatorFor, readAllHrefs, readFirstHref } from './locators.js';
import {
  isExactJobUrl,
  parseBuildReference,
  parseQueueReference,
  validateJenkinsUrl,
} from './url-identity.js';

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

function usesDefaultBuildUrlSelector(config: RunnerConfig): boolean {
  const selector = config.selectors.buildUrl;
  return selector.kind === 'testId' && selector.value === 'jenkins-build-url';
}

function usesDefaultBuildStatusSelector(config: RunnerConfig): boolean {
  const selector = config.selectors.buildStatus;
  return selector.kind === 'testId' && selector.value === 'jenkins-build-status';
}

function isNotFound(error: unknown): boolean {
  return error instanceof JenkinsFlowError && /HTTP 404\b/u.test(error.message);
}

const MAX_QUEUE_API_BYTES = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameApiEndpoint(actualUrl: string, expectedUrl: string): boolean {
  try {
    const actual = new URL(actualUrl);
    const expected = new URL(expectedUrl);
    return actual.origin === expected.origin &&
      actual.pathname === expected.pathname &&
      actual.search === expected.search &&
      actual.hash === '' && expected.hash === '';
  } catch {
    return false;
  }
}

function assertApiResponseIdentity(
  response: APIResponse,
  expectedUrl: string,
  config: RunnerConfig,
  label: string,
): void {
  try {
    validateJenkinsUrl(response.url(), config.baseUrl);
  } catch {
    throw new JenkinsFlowError(`Jenkins ${label} API response left the configured origin`);
  }
  if (!sameApiEndpoint(response.url(), expectedUrl)) {
    throw new JenkinsFlowError(`Jenkins ${label} API response did not preserve the requested endpoint`);
  }
}

async function readQueueApiBuild(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  queue: QueueReference,
  baselineBuildNumber: number | undefined,
  deadline: WorkflowDeadline,
): Promise<BuildReference | undefined> {
  if (!usesDefaultBuildUrlSelector(config)) return undefined;
  const queueBase = new URL(queue.url);
  queueBase.pathname = `${queueBase.pathname.replace(/\/+$/u, '')}/`;
  const apiUrl = new URL('api/json', queueBase);
  apiUrl.searchParams.set('tree', 'cancelled,executable[number,url],task[url]');
  validateJenkinsUrl(apiUrl.toString(), config.baseUrl);

  let response: APIResponse;
  try {
    response = await page.request.get(apiUrl.toString(), {
      timeout: deadline.requireRemaining(),
      failOnStatusCode: false,
      maxRedirects: 0,
    });
  } catch {
    return undefined;
  }
  assertApiResponseIdentity(response, apiUrl.toString(), config, 'queue');
  if (!response.ok()) return undefined;
  const contentLength = Number(response.headers()['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_QUEUE_API_BYTES) {
    throw new JenkinsFlowError('Jenkins queue API response exceeded the safe limit');
  }
  const body = await response.body();
  if (body.byteLength > MAX_QUEUE_API_BYTES) {
    throw new JenkinsFlowError('Jenkins queue API response exceeded the safe limit');
  }

  let value: unknown;
  try {
    value = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
  if (
    !isRecord(value) ||
    value.cancelled === true ||
    !isRecord(value.task) ||
    typeof value.task.url !== 'string' ||
    !isExactJobUrl(value.task.url, job.url) ||
    !isRecord(value.executable) ||
    typeof value.executable.number !== 'number' ||
    !Number.isSafeInteger(value.executable.number) ||
    typeof value.executable.url !== 'string'
  ) {
    return undefined;
  }
  const build = parseBuildReference(value.executable.url, config.baseUrl, job.url);
  return build !== undefined &&
    build.number === value.executable.number &&
    build.number > (baselineBuildNumber ?? 0)
    ? build
    : undefined;
}

async function readBuildApiStatus(
  page: Page,
  config: RunnerConfig,
  build: BuildReference,
  deadline: WorkflowDeadline,
): Promise<string | null> {
  if (!usesDefaultBuildStatusSelector(config)) return null;
  const apiUrl = new URL('api/json', build.url);
  apiUrl.searchParams.set('tree', 'building,result');
  validateJenkinsUrl(apiUrl.toString(), config.baseUrl);

  let response: APIResponse;
  try {
    response = await page.request.get(apiUrl.toString(), {
      timeout: deadline.requireRemaining(),
      failOnStatusCode: false,
      maxRedirects: 0,
    });
  } catch {
    return null;
  }
  assertApiResponseIdentity(response, apiUrl.toString(), config, 'build');
  if (!response.ok()) return null;
  const contentLength = Number(response.headers()['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_QUEUE_API_BYTES) {
    throw new JenkinsFlowError('Jenkins build API response exceeded the safe limit');
  }
  const body = await response.body();
  if (body.byteLength > MAX_QUEUE_API_BYTES) {
    throw new JenkinsFlowError('Jenkins build API response exceeded the safe limit');
  }

  let value: unknown;
  try {
    value = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (typeof value.result === 'string') return value.result;
  return value.building === true ? 'BUILDING' : null;
}

async function readCorrelatedBuild(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  baselineBuildNumber: number | undefined,
  queue: QueueReference | undefined,
  deadline: WorkflowDeadline,
): Promise<BuildReference | undefined> {
  let hrefs = await readAllHrefs(locatorFor(page, config.selectors.buildUrl), page);
  if (hrefs.length === 0 && usesDefaultBuildUrlSelector(config)) {
    hrefs = await readAllHrefs(page.locator('a[href]'), page);
  }
  const candidates = hrefs
    .map((href) => parseBuildReference(href, config.baseUrl, job.url))
    .filter((candidate): candidate is BuildReference =>
      candidate !== undefined && candidate.number > (baselineBuildNumber ?? 0));
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];
  if (unique.length === 1) {
    const candidate = unique[0];
    if (candidate === undefined) return undefined;
    // Custom selectors remain authoritative. The default selector needs the
    // queue API executable as a causal proof because a queue page can expose a
    // concurrent newer build link.
    if (!usesDefaultBuildUrlSelector(config) || queue === undefined) return candidate;
    const apiBuild = await readQueueApiBuild(page, config, job, queue, baselineBuildNumber, deadline);
    return apiBuild !== undefined && sameBuild(apiBuild, candidate) ? candidate : undefined;
  }
  if (unique.length === 0 && queue !== undefined) {
    return readQueueApiBuild(page, config, job, queue, baselineBuildNumber, deadline);
  }
  return undefined;
}

async function readRedirectedBuildWithQueueProof(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  queue: QueueReference,
  baselineBuildNumber: number | undefined,
  deadline: WorkflowDeadline,
): Promise<BuildReference | undefined> {
  const directBuild = parseBuildReference(page.url(), config.baseUrl, job.url);
  if (directBuild === undefined) return undefined;
  const apiBuild = await readQueueApiBuild(page, config, job, queue, baselineBuildNumber, deadline);
  return apiBuild !== undefined && sameBuild(apiBuild, directBuild) ? apiBuild : undefined;
}

async function readBuildStatus(page: Page, config: RunnerConfig): Promise<string | null> {
  const configuredLocator = locatorFor(page, config.selectors.buildStatus).first();
  if (await configuredLocator.count() > 0) {
    const configured = await configuredLocator.textContent();
    if (configured !== null && configured.trim().length > 0) return configured;
  }
  if (!usesDefaultBuildStatusSelector(config)) return null;
  return page.locator('.jenkins-build-caption').first().textContent();
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
  if (reported === undefined && usesDefaultBuildUrlSelector(config)) return;
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
    try {
      await gotoSuccessful(page, queue.url, deadline);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      const apiBuild = await readQueueApiBuild(page, config, job, queue, baselineBuildNumber, deadline);
      if (apiBuild !== undefined) return apiBuild;
      throw new JenkinsFlowError('Jenkins queue item disappeared without an exact executable build');
    }
    validateJenkinsUrl(page.url(), config.baseUrl);
    const currentQueue = parseQueueReference(page.url(), config.baseUrl);
    if (currentQueue?.id !== queue.id) {
      const redirectedBuild = await readRedirectedBuildWithQueueProof(
        page, config, job, queue, baselineBuildNumber, deadline,
      );
      if (redirectedBuild !== undefined) return redirectedBuild;
      throw new JenkinsFlowError('Jenkins queue navigation did not preserve an exact queue executable proof');
    }
    const result = await pollUntil<BuildReference>({
      deadline,
      intervalMs: config.pollIntervalMs,
      observe: async () => {
        try {
          const observedQueue = parseQueueReference(page.url(), config.baseUrl);
          if (observedQueue?.id !== queue.id) {
            const redirectedBuild = await readRedirectedBuildWithQueueProof(
              page, config, job, queue, baselineBuildNumber, deadline,
            );
            if (redirectedBuild !== undefined) return redirectedBuild;
            throw new JenkinsFlowError('Jenkins queue navigation did not preserve an exact queue executable proof');
          }
          const build = await readCorrelatedBuild(page, config, job, baselineBuildNumber, queue, deadline);
          if (build !== undefined) return build;
          if (reloadCount === 0) {
            reloadCount += 1;
            try {
              await reloadSuccessful(page, deadline);
            } catch (error) {
              if (!isNotFound(error)) throw error;
              const apiBuild = await readQueueApiBuild(page, config, job, queue, baselineBuildNumber, deadline);
              if (apiBuild !== undefined) return apiBuild;
              throw new JenkinsFlowError('Jenkins queue item disappeared without an exact executable build');
            }
          }
          return undefined;
        } catch (error) {
          pushDiagnostic(observationErrors, formatJenkinsObservation(error, config));
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
          let status = await readBuildStatus(page, config);
          if (status === null || status.trim() === '' || !isTerminalStatus(status)) {
            const apiStatus = await readBuildApiStatus(page, config, build, deadline);
            if (apiStatus !== null) status = apiStatus;
          }
          if (status === null || status.trim() === '') throw new Error('Jenkins build status was not readable');
          if (!isTerminalStatus(status) && reloadCount === 0) {
            reloadCount += 1;
            await reloadSuccessful(page, deadline);
          }
          return status.trim();
        } catch (error) {
          pushDiagnostic(observationErrors, formatJenkinsObservation(error, config));
          if (reloadCount === 0) {
            reloadCount += 1;
            await reloadSuccessful(page, deadline);
          }
          throw error;
        }
      },
      accept: isTerminalStatus,
    });
    return {
      build,
      status: redactText(result.value, [config.username, config.password]).slice(0, 256),
      observedAt: new Date().toISOString(), observationErrors, reloadCount,
    };
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure(
      'Jenkins build did not reach a terminal state', error, config, page, build.url, observationErrors,
    ));
  }
}
