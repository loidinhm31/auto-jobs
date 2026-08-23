import type { Page } from '@playwright/test';

import type { RunnerConfig } from '../config.js';
import type { JenkinsBaseline, QueueReference } from '../types.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { latestBuildNumber as readLatestBuildNumber, type JenkinsJobReference } from './job.js';
import { locatorFor, readAllHrefs } from './locators.js';
import { parseQueueReference } from './url-identity.js';

function uniqueQueues(queues: readonly QueueReference[]): QueueReference[] {
  return [...new Map(queues.map((queue) => [queue.id, queue])).values()];
}

/** Captures only pre-click evidence; callers must not reuse it after a submission. */
export async function captureJenkinsBaseline(
  page: Page,
  config: RunnerConfig,
  job: JenkinsJobReference,
  deadline: WorkflowDeadline,
): Promise<JenkinsBaseline> {
  deadline.requireRemaining();
  const hrefs = await readAllHrefs(locatorFor(page, config.selectors.queueUrl), page);
  const queueItems = uniqueQueues(hrefs
    .map((href) => parseQueueReference(href, config.baseUrl))
    .filter((queue): queue is QueueReference => queue !== undefined));
  const latestBuildNumber = await readLatestBuildNumber(page, config, job.url, deadline);
  const baseline: JenkinsBaseline = {
    capturedAt: new Date().toISOString(),
    queueItems,
  };
  if (latestBuildNumber !== undefined) baseline.latestBuildNumber = latestBuildNumber;
  return baseline;
}

export function isNewQueue(
  candidate: QueueReference,
  baseline: JenkinsBaseline,
): boolean {
  return !baseline.queueItems.some((item) => item.id === candidate.id || item.url === candidate.url);
}
