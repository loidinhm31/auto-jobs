import type { Page, Request, Response } from '@playwright/test';

import type { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import {
  locateAndValidateBuildFormAndButton,
  locateAndValidateBuildParametersLink,
} from './build-trigger-validation.js';
import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import type { JenkinsRunnerConfig } from './runner-config.js';
import { isExactJenkinsJobActionUrl, validateJenkinsJobActionUrl } from './url-identity.js';

export type JenkinsBuildTriggerState = 'submitted' | 'rejected' | 'submission-unknown';

export interface JenkinsBuildTriggerResult {
  readonly state: JenkinsBuildTriggerState;
  readonly jobUrl: string;
  readonly buildPageUrl: string;
  readonly submittedAt: string;
  readonly responseStatus?: number;
}

export async function triggerParameterizedBuild(
  page: Page,
  config: JenkinsRunnerConfig,
  deadline: WorkflowDeadline,
): Promise<JenkinsBuildTriggerResult> {
  deadline.requireRemaining();
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
    if (req.method() === 'POST' && isExactJenkinsJobActionUrl(req.url(), config.jobUrl, { allowDelay: false })) {
      postObserved = true;
    }
  };

  const onResponse = (res: Response) => {
    if (res.request().method() === 'POST' && isExactJenkinsJobActionUrl(res.url(), config.jobUrl, { allowDelay: false })) {
      postResponse = { status: res.status(), url: res.url() };
    }
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  const submittedAt = new Date().toISOString();
  try {
    const remainingTimeout = Math.max(1, Math.min(deadline.remainingMs(), config.timeoutMs));
    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST' && isExactJenkinsJobActionUrl(res.url(), config.jobUrl, { allowDelay: false }),
      { timeout: remainingTimeout },
    );
    const clickPromise = buildButton.click({ timeout: remainingTimeout });
    const [response] = await Promise.all([responsePromise, clickPromise]);
    const status = response.status();
    if (status < 400) {
      return {
        state: 'submitted',
        jobUrl: config.jobUrl,
        buildPageUrl,
        submittedAt,
        responseStatus: status,
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
