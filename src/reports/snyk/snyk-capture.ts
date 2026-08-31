import type { Page } from '@playwright/test';

import { sanitizeUrl } from '../../config-errors.js';
import type { NormalizedProjectConfig } from '../../config/config-types.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import type {
  CaptureMetadata,
  NavigationTarget,
  SnykSourceEvidence,
} from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import { settleCleanup, WorkflowDeadlineExceededError, withWorkflowDeadline, withWorkflowDeadlineAndLateResource, type WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import { boundedDiagnostics } from '../../workflow/diagnostics.js';
import { extractSnykHtml } from './snyk-html-extractor.js';
import { normalizeSnykEvidence } from './snyk-normalize.js';
import {
  captureFailureMessage,
  openScriptSafePage,
  readSummary,
  safeObservedUrl,
  screenshotReport,
  type ScriptSafePage,
  type SnykSummaryEvidence,
  SNYK_VIEWPORT,
  snykProjectIdentityWarning,
  waitForLandmark,
} from './snyk-capture-support.js';

export interface SnykCaptureResult {
  source: SnykSourceEvidence;
  navigation: NavigationTarget;
  screenshots: string[];
  warnings: string[];
}

export type SnykSummaryReader = (
  page: Page,
  summaryUrl: string,
  project: NormalizedProjectConfig,
  deadline: WorkflowDeadline,
) => Promise<SnykSummaryEvidence>;


async function settleRouteAction(
  operation: () => Promise<void>,
  deadline: WorkflowDeadline,
): Promise<void> {
  try {
    await withWorkflowDeadline(operation, deadline);
  } catch (error) {
    if (!(error instanceof WorkflowDeadlineExceededError)) throw error;
  }
}


function navigation(state: SnykSourceEvidence['state'], liveUrl?: string): NavigationTarget {
  return {
    key: 'snyk-report',
    localAnchor: '#snyk-test-report',
    state,
    ...(liveUrl === undefined ? {} : { liveUrl }),
  };
}

function incompleteResult(
  reportUrl: string | undefined,
  warnings: readonly string[],
): SnykCaptureResult {
  const source: SnykSourceEvidence = {
    state: 'incomplete', captures: [],
    navigation: [navigation('incomplete', reportUrl)],
    warnings: boundedDiagnostics([...warnings]),
    findings: [],
  };
  return { source, navigation: source.navigation[0] as NavigationTarget, screenshots: [], warnings: source.warnings };
}

/** Capture one URL selected from the exact Jenkins job page. */
export async function captureSnykEvidence(input: {
  page: Page;
  project: NormalizedProjectConfig;
  deadline: WorkflowDeadline;
  outputDirectory: string;
  reportUrl?: string;
  summaryUrl?: string;
  discoveryWarnings?: readonly string[];
  openSafePage?: (page: Page, deadline: WorkflowDeadline) => Promise<ScriptSafePage>;
  readSummary?: SnykSummaryReader;
}): Promise<SnykCaptureResult> {
  const reportUrl = input.reportUrl;
  const jobPageUrl = input.page.url();
  let policyBlocked = false;
  let completedResult: SnykCaptureResult | undefined;
  try {
    const discoveryWarnings = [...(input.discoveryWarnings ?? [])];
    if (reportUrl === undefined) {
      const sourceWarnings = discoveryWarnings.length === 0
        ? ['Snyk report destination was not uniquely discovered']
        : discoveryWarnings;
      return incompleteResult(undefined, sourceWarnings);
    }
    if (input.summaryUrl === undefined) {
      discoveryWarnings.push('Snyk summary destination was not uniquely discovered');
    }

    const safeCapture = await withWorkflowDeadlineAndLateResource(
      () => (input.openSafePage ?? openScriptSafePage)(input.page, input.deadline),
      input.deadline,
      (lateCapture) => settleCleanup(() => lateCapture.close()),
    );
    const capturePage = safeCapture.page;
    try {
      await withWorkflowDeadline(() => capturePage.setViewportSize(SNYK_VIEWPORT), input.deadline);
      const routeHandler = async (route: Parameters<Parameters<Page['route']>[1]>[0]): Promise<void> => {
        const request = route.request();
        try {
          assertAllowedUrl(
            request.url(),
            deriveJenkinsBaseUrl(input.project.loginUrl, input.project.jobUrl),
            input.project.sourceOrigins.snyk,
            'Snyk request URL',
          );
        } catch {
          if (request.isNavigationRequest() && request.resourceType() === 'document') policyBlocked = true;
          await settleRouteAction(() => route.abort('blockedbyclient'), input.deadline);
          return;
        }
        const blocked = ['font', 'image', 'media', 'script', 'worker', 'websocket'].includes(request.resourceType());
        if (blocked) await settleRouteAction(() => route.abort(), input.deadline);
        else await settleRouteAction(() => route.fallback(), input.deadline);
      };
      await withWorkflowDeadline(() => capturePage.route('**/*', routeHandler), input.deadline);
      try {
        const response = await withWorkflowDeadline(() => capturePage.goto(reportUrl, {
          waitUntil: 'domcontentloaded',
          timeout: input.deadline.requireRemaining(),
        }), input.deadline);
        if (policyBlocked) throw new Error('Snyk request was blocked by the configured origin policy');
        const validatedFinalUrl = assertAllowedUrl(
          capturePage.url(),
          deriveJenkinsBaseUrl(input.project.loginUrl, input.project.jobUrl),
          input.project.sourceOrigins.snyk,
          'Snyk final URL',
        );
        const finalUrl = sanitizeUrl(validatedFinalUrl);
        if (response !== null && response.status() >= 400) throw new Error(`Snyk report returned HTTP ${response.status()}`);
        const landmark = await waitForLandmark(capturePage, input.project, input.deadline);
        const html = await withWorkflowDeadline(() => extractSnykHtml(capturePage), input.deadline);
        let summaryEvidence: SnykSummaryEvidence | undefined;
        const warnings = [...discoveryWarnings];
        const identityWarning = snykProjectIdentityWarning(html.metadata, input.project, finalUrl);
        if (identityWarning !== undefined) warnings.push(identityWarning);
        if (input.summaryUrl !== undefined) {
          try {
            const evidence = await withWorkflowDeadline(
              () => (input.readSummary ?? readSummary)(
                capturePage,
                input.summaryUrl as string,
                input.project,
                input.deadline,
              ),
              input.deadline,
            );
            summaryEvidence = evidence;
          } catch (error) {
            warnings.push(`Snyk summary evidence failed: ${captureFailureMessage(error)}`);
          }
        }
        const normalized = normalizeSnykEvidence({
          html,
          ...(summaryEvidence === undefined ? {} : { summary: summaryEvidence.parsed }),
          warnings,
        });
        const capturedAt = new Date().toISOString();
        const title = (await withWorkflowDeadline(() => capturePage.title(), input.deadline)).trim();
        const capture: CaptureMetadata = {
          url: finalUrl,
          ...(title.length === 0 ? {} : { title: title.slice(0, 512) }),
          capturedAt,
          selectorStrategy: `${landmark.strategy};cards=${html.selectorStrategy ?? 'none'}`,
          viewport: SNYK_VIEWPORT,
        };
        const captures: CaptureMetadata[] = [{ ...capture }];
        if (summaryEvidence !== undefined) {
          captures.push({
            url: sanitizeUrl(summaryEvidence.url),
            capturedAt,
            selectorStrategy: 'summary-json',
          });
        }
        let screenshot: Awaited<ReturnType<typeof screenshotReport>> | undefined;
        try {
          screenshot = await screenshotReport(capturePage, input.outputDirectory, input.deadline);
        } catch (error) {
          warnings.push(`Snyk screenshot capture failed: ${captureFailureMessage(error)}`);
        }
        const finalWarnings = boundedDiagnostics([...new Set([
          ...normalized.warnings,
          ...warnings,
          ...(screenshot === undefined ? ['Snyk screenshot evidence is unavailable'] : []),
        ])]);
        captures[0] = { ...capture, ...(screenshot?.metadata ?? {}) };
        const source: SnykSourceEvidence = {
          state: finalWarnings.length === 0 ? 'found' : 'incomplete',
          captures,
          navigation: [navigation(finalWarnings.length === 0 ? 'found' : 'incomplete', finalUrl)],
          warnings: finalWarnings,
          summary: normalized.summary,
          findings: normalized.findings,
        };
        completedResult = {
          source,
          navigation: source.navigation[0] as NavigationTarget,
          screenshots: screenshot === undefined ? [] : [screenshot.filename],
          warnings: finalWarnings,
        };
        return completedResult;
      } finally {
        await settleCleanup(() => capturePage.unroute('**/*', routeHandler));
      }
    } finally {
      try {
        await settleCleanup(() => safeCapture.close());
      } finally {
        if (capturePage === input.page && input.page.url() !== jobPageUrl) {
          try {
            await input.page.goto(jobPageUrl, {
              waitUntil: 'domcontentloaded',
              timeout: input.deadline.requireRemaining(),
            });
          } catch (error) {
            const warning = `Snyk source page restore failed: ${captureFailureMessage(error)}`;
            if (completedResult !== undefined) {
              const warnings = boundedDiagnostics([...new Set([...completedResult.warnings, warning])]);
              completedResult.warnings = warnings;
              completedResult.source = {
                ...completedResult.source,
                state: 'incomplete',
                navigation: [navigation('incomplete', completedResult.navigation.liveUrl)],
                warnings,
              };
              completedResult.navigation = completedResult.source.navigation[0] as NavigationTarget;
            } else {
              throw error;
            }
          }
        }
      }
    }
  } catch (error) {
    const diagnostic = policyBlocked
      ? 'Snyk request blocked by the configured origin policy'
      : captureFailureMessage(error);
    return incompleteResult(
      reportUrl === undefined ? safeObservedUrl(input.page, input.project) : sanitizeUrl(reportUrl),
      [diagnostic],
    );
  }
}
