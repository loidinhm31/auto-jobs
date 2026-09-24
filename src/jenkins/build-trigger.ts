import type { Page, Request, Response } from '@playwright/test';

import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import {
  locateAndValidateBuildFormAndButton,
  locateAndValidateBuildParametersLink,
} from './build-trigger-validation.js';
import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import type { JenkinsRunnerConfig } from './runner-config.js';
import { isExactJenkinsJobActionUrl, isExactJobUrl, validateJenkinsJobActionUrl } from './url-identity.js';
import {
  estimateBuildTimeoutMs,
  formatDurationHuman,
  getLatestStageViewRun,
  waitForStageViewCompletion,
} from './stage-view.js';
import type { StageViewStage } from './stage-view-types.js';

export type JenkinsBuildTriggerState =
  | 'succeeded'
  | 'submitted'
  | 'rejected'
  | 'submission-unknown'
  | 'failed'
  | 'timeout';

export interface TriggerParameterizedBuildOptions {
  readonly waitForCompletion?: boolean | undefined;
  readonly waitTimeoutMs?: number | undefined;
  readonly onProgress?: ((message: string) => void) | undefined;
}

export interface JenkinsBuildTriggerResult {
  readonly state: JenkinsBuildTriggerState;
  readonly jobUrl: string;
  readonly buildPageUrl: string;
  readonly buildNumber?: string | undefined;
  readonly buildResult?: string | undefined;
  readonly stages?: readonly StageViewStage[] | undefined;
  readonly submittedAt: string;
  readonly responseStatus?: number | undefined;
  readonly error?: string | undefined;
}

export async function triggerParameterizedBuild(
  page: Page,
  config: JenkinsRunnerConfig,
  deadline: WorkflowDeadline,
  options: TriggerParameterizedBuildOptions = {},
): Promise<JenkinsBuildTriggerResult> {
  deadline.requireRemaining();
  const waitForCompletion = options.waitForCompletion === true;
  let previousRunId: number | undefined;
  let estimatedTimeoutMs: number | undefined;
  if (waitForCompletion) {
    try {
      const latest = await getLatestStageViewRun(page);
      previousRunId = latest?.runId;
      if (options.waitTimeoutMs !== undefined && options.waitTimeoutMs > 0) {
        estimatedTimeoutMs = options.waitTimeoutMs;
      } else {
        const estimate = await estimateBuildTimeoutMs(page, latest);
        estimatedTimeoutMs = estimate.timeoutMs;
        if (estimate.estimatedDurationMs > 0) {
          options.onProgress?.(
            `[Stage View] Previous build took ${formatDurationHuman(estimate.estimatedDurationMs)}. Calculated build timeout: ${formatDurationHuman(estimatedTimeoutMs)} (including 50% buffer + 3m queue buffer).`,
          );
        }
      }
    } catch {
      // Continue if initial Stage View read is unready
    }
  }
  // Step 1: Locate and validate link inside #side-panel
  const buildLink = await locateAndValidateBuildParametersLink(page, config);

  // Step 2: Click link and wait for build page navigation
  try {
    const navPromise = page.waitForURL(
      (url) => isExactJenkinsJobActionUrl(url.toString(), config.jobUrl, { allowDelay: true, actionName: 'build' }),
      { timeout: Math.min(deadline.remainingMs(), config.timeoutMs) },
    );
    await buildLink.click({ timeout: Math.min(deadline.remainingMs(), config.timeoutMs) });
    await navPromise;
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure('Navigate to build parameters page', error, config, page));
  }

  const buildPageUrl = page.url();
  try {
    validateJenkinsJobActionUrl(buildPageUrl, config.jobUrl, config.baseUrl, { allowDelay: true, actionName: 'build' });
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure('Validate build parameters page URL', error, config, page));
  }

  // Step 3: Locate and validate form and submit button inside #bottom-sticker
  const buildButton = await locateAndValidateBuildFormAndButton(page, config);

  // Step 4: Arm request and response observers before the click
  let postObserved = false;
  let postResponse: { status: number; url: string } | undefined;

  const onRequest = (req: Request) => {
    if (req.method() === 'POST' && isExactJenkinsJobActionUrl(req.url(), config.jobUrl, { allowDelay: true })) {
      postObserved = true;
    }
  };

  const onResponse = (res: Response) => {
    if (res.request().method() === 'POST' && isExactJenkinsJobActionUrl(res.url(), config.jobUrl, { allowDelay: true })) {
      postResponse = { status: res.status(), url: res.url() };
    }
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  const submittedAt = new Date().toISOString();
  try {
    const remainingTimeout = Math.max(1, Math.min(deadline.remainingMs(), config.timeoutMs));
    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST' && isExactJenkinsJobActionUrl(res.url(), config.jobUrl, { allowDelay: true }),
      { timeout: remainingTimeout },
    );
    const clickPromise = buildButton.click({ timeout: remainingTimeout });
    const [response] = await Promise.all([responsePromise, clickPromise]);
    const status = response.status();
    if (status < 400) {
      if (!waitForCompletion) {
        return {
          state: 'submitted',
          jobUrl: config.jobUrl,
          buildPageUrl,
          submittedAt,
          responseStatus: status,
        };
      }

      const effectiveWaitTimeoutMs = options.waitTimeoutMs ?? estimatedTimeoutMs ?? 900_000;
      const buildDeadline = new WorkflowDeadline(effectiveWaitTimeoutMs);

      options.onProgress?.(
        `[Auto-Build] Build form submitted (HTTP ${status}). Following redirect to job page (monitoring timeout: ${formatDurationHuman(effectiveWaitTimeoutMs)})...`,
      );
      try {
        await page.waitForURL((url) => isExactJobUrl(url.toString(), config.jobUrl), {
          timeout: Math.max(1_000, Math.min(buildDeadline.remainingMs(), 30_000)),
        });
      } catch {
        try {
          await page.goto(config.jobUrl, { waitUntil: 'domcontentloaded' });
        } catch {
          // Fall through to Stage View check
        }
      }

      const stageViewResult = await waitForStageViewCompletion(page, previousRunId, buildDeadline, {
        onProgress: options.onProgress,
      });

      if (stageViewResult.completed && stageViewResult.run) {
        const run = stageViewResult.run;
        const isSuccess = run.status === 'SUCCESS';
        return {
          state: isSuccess ? 'succeeded' : 'failed',
          jobUrl: config.jobUrl,
          buildPageUrl,
          buildNumber: run.buildNumber,
          buildResult: run.status,
          stages: run.stages,
          submittedAt,
          responseStatus: status,
        };
      }

      return {
        state: 'timeout',
        jobUrl: config.jobUrl,
        buildPageUrl,
        buildNumber: stageViewResult.run?.buildNumber,
        buildResult: stageViewResult.run?.status,
        stages: stageViewResult.run?.stages,
        submittedAt,
        responseStatus: status,
        error: stageViewResult.error ?? 'Stage View build observation did not complete within deadline',
      };
    }
    return {
      state: 'rejected',
      jobUrl: config.jobUrl,
      buildPageUrl,
      submittedAt,
      responseStatus: status,
    };
  } catch (error) {
    if (postObserved) {
      return {
        state: 'submission-unknown',
        jobUrl: config.jobUrl,
        buildPageUrl,
        submittedAt,
        ...(postResponse === undefined ? {} : { responseStatus: postResponse.status }),
      };
    }
    throw new JenkinsFlowError(formatJenkinsFailure('Submit parameterized build', error, config, page));
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
  }
}
