import { type Page } from '@playwright/test';

import { sanitizeUrl } from '../../config-errors.js';
import type { NormalizedProjectConfig } from '../../config/config-types.js';
import type {
  CaptureMetadata,
  NavigationTarget,
  SnykSourceEvidence,
} from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import { boundedDiagnostics } from '../../workflow/diagnostics.js';
import {
  classifySnykLinks,
} from '../source-link-classifier.js';
import { extractSnykHtml } from './snyk-html-extractor.js';
import { normalizeSnykEvidence } from './snyk-normalize.js';
import {
  captureFailureMessage,
  openScriptSafePage,
  pageLinkCandidates,
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

function navigation(state: SnykSourceEvidence['state'], liveUrl?: string): NavigationTarget {
  return {
    key: 'snyk-report',
    localAnchor: '#snyk-test-report',
    state,
    ...(liveUrl === undefined ? {} : { liveUrl }),
  };
}

function terminalIdentity(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}${url.search}`;
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

/** Capture one validated Snyk report from terminal-build evidence. */
export async function captureSnykEvidence(input: {
  page: Page;
  project: NormalizedProjectConfig;
  deadline: WorkflowDeadline;
  outputDirectory: string;
  terminalBuildUrl?: string;
  openSafePage?: (page: Page) => Promise<ScriptSafePage>;
  readSummary?: SnykSummaryReader;
}): Promise<SnykCaptureResult> {
  let reportUrl: string | undefined;
  let terminalUrl: string | undefined;
  let policyBlocked = false;
  try {
    const currentTerminalUrl = assertAllowedUrl(input.page.url(), input.project.baseUrl, [input.project.sourceOrigins.jenkins], 'Jenkins terminal URL');
    terminalUrl = currentTerminalUrl;
    if (input.terminalBuildUrl !== undefined) {
      const expectedTerminalUrl = assertAllowedUrl(input.terminalBuildUrl, input.project.baseUrl, [input.project.sourceOrigins.jenkins], 'terminal build URL');
      if (terminalIdentity(currentTerminalUrl) !== terminalIdentity(expectedTerminalUrl)) {
        throw new Error('Snyk capture did not start from the exact terminal Jenkins build');
      }
    }
    const links = await pageLinkCandidates(input.page);
    const classified = classifySnykLinks(links, input.project);
    reportUrl = classified.report?.href;
    if (reportUrl === undefined) {
      const state = classified.warnings.length === 0 ? 'not_found' : 'incomplete';
      const source: SnykSourceEvidence = {
        state, captures: [], navigation: [navigation(state)], warnings: boundedDiagnostics(classified.warnings), findings: [],
      };
      return { source, navigation: source.navigation[0] as NavigationTarget, screenshots: [], warnings: source.warnings };
    }

    const safeCapture = await (input.openSafePage ?? openScriptSafePage)(input.page);
    const capturePage = safeCapture.page;
    try {
      await capturePage.setViewportSize(SNYK_VIEWPORT);
      const routeHandler = async (route: Parameters<Parameters<Page['route']>[1]>[0]): Promise<void> => {
        const request = route.request();
        try {
          assertAllowedUrl(
            request.url(),
            input.project.baseUrl,
            input.project.sourceOrigins.snyk,
            'Snyk request URL',
          );
        } catch {
          if (request.isNavigationRequest() && request.resourceType() === 'document') policyBlocked = true;
          await route.abort('blockedbyclient');
          return;
        }
        const blocked = ['font', 'image', 'media', 'script', 'worker', 'websocket'].includes(request.resourceType());
        if (blocked) await route.abort();
        else await route.fallback();
      };
      await capturePage.route('**/*', routeHandler);
      try {
        const response = await capturePage.goto(reportUrl, {
          waitUntil: 'domcontentloaded',
          timeout: input.deadline.requireRemaining(),
        });
        if (policyBlocked) throw new Error('Snyk request was blocked by the configured origin policy');
        const validatedFinalUrl = assertAllowedUrl(
          capturePage.url(),
          input.project.baseUrl,
          input.project.sourceOrigins.snyk,
          'Snyk final URL',
        );
        const finalUrl = sanitizeUrl(validatedFinalUrl);
        if (response !== null && response.status() >= 400) throw new Error(`Snyk report returned HTTP ${response.status()}`);
        const landmark = await waitForLandmark(capturePage, input.project, input.deadline);
        const html = await extractSnykHtml(capturePage);
        let summaryEvidence: Awaited<ReturnType<typeof readSummary>> | undefined;
        const warnings = [...classified.warnings];
        const identityWarning = snykProjectIdentityWarning(html.metadata, input.project, finalUrl);
        if (identityWarning !== undefined) warnings.push(identityWarning);
        if (classified.summary?.href !== undefined) {
          try {
            summaryEvidence = await (input.readSummary ?? readSummary)(capturePage, classified.summary.href, input.project, input.deadline);
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
        const title = (await capturePage.title()).trim();
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
        return {
          source,
          navigation: source.navigation[0] as NavigationTarget,
          screenshots: screenshot === undefined ? [] : [screenshot.filename],
          warnings: finalWarnings,
        };
      } finally {
        await capturePage.unroute('**/*', routeHandler);
      }
    } finally {
      try {
        await safeCapture.close();
      } finally {
        if (capturePage === input.page && terminalUrl !== undefined && input.page.url() !== terminalUrl) {
          await input.page.goto(terminalUrl, {
            waitUntil: 'domcontentloaded',
            timeout: input.deadline.requireRemaining(),
          });
        }
      }
    }
  } catch (error) {
    const diagnostic = policyBlocked
      ? 'Snyk request blocked by the configured origin policy'
      : captureFailureMessage(error);
    return incompleteResult(reportUrl === undefined ? safeObservedUrl(input.page, input.project) : sanitizeUrl(reportUrl), [diagnostic]);
  }
}
