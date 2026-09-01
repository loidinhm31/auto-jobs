import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../config/config-types.js';
import { formatDiagnostic, sanitizeUrl } from '../../config-errors.js';
import type { CaptureMetadata, SnykScanMetadata } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import { settleCleanup, withWorkflowDeadline, withWorkflowDeadlineAndLateResource, type WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import {
  locatorFor,
  selectorDescription,
} from '../../jenkins/locators.js';
import type { PageLinkCandidate } from '../source-link-classifier.js';
import { MAX_SUMMARY_BYTES, parseSnykSummaryJson, type ParsedSnykSummary } from './snyk-summary-parser.js';

export const SNYK_VIEWPORT = { width: 1_440, height: 900 } as const;
export const SNYK_SCREENSHOT_NAME = 'snyk-test-report.png';
const MAX_LINK_CANDIDATES = 256;
const MAX_LINK_CANDIDATE_HREF_BYTES = 2_048;
const MAX_LINK_CANDIDATE_FIELD_BYTES = 2_048;
const MAX_LINK_DISCOVERY_BYTES = 256 * 1_024;
const MAX_SUMMARY_REDIRECTS = 5;
const MAX_SCREENSHOT_ATTEMPTS = 3;

async function bounded<T>(operation: () => Promise<T>, deadline?: WorkflowDeadline): Promise<T> {
  return deadline === undefined ? operation() : withWorkflowDeadline(operation, deadline);
}

async function withLateResource<T>(
  operation: () => Promise<T>,
  deadline: WorkflowDeadline | undefined,
  onLateResource: (resource: T) => Promise<void>,
): Promise<T> {
  return deadline === undefined ? operation() : withWorkflowDeadlineAndLateResource(operation, deadline, onLateResource);
}

export interface SnykSummaryEvidence {
  parsed: ParsedSnykSummary;
  url: string;
}

export interface PageLinkCandidateCollection {
  readonly candidates: readonly PageLinkCandidate[];
  readonly truncated: boolean;
}
export interface ScriptSafePage {
  readonly page: Page;
  readonly close: () => Promise<void>;
}


export async function pageLinkCandidatesWithStatus(
  page: Page,
  deadline?: WorkflowDeadline,
): Promise<PageLinkCandidateCollection> {
  const collect = (): Promise<PageLinkCandidateCollection> => page.evaluate((limits) => {
    const result: PageLinkCandidate[] = [];
    const items = document.querySelectorAll('a[href]');
    let truncated = items.length > limits.maximum;
    let collectedBytes = 0;
    const encoder = new TextEncoder();
    const boundedField = (raw: string | null, maximumBytes: number): string | undefined => {
      if (raw === null || raw.length === 0 || raw.length > maximumBytes) return undefined;
      const value = raw.trim();
      return value.length === 0 ? undefined : value;
    };
    const withinByteLimit = (raw: string, maximumBytes: number): boolean =>
      raw.length <= maximumBytes && encoder.encode(raw).byteLength <= maximumBytes;
    const withinOptionalByteLimit = (raw: string | null, maximumBytes: number): boolean =>
      raw === null || raw.length === 0 || withinByteLimit(raw, maximumBytes);
    for (let index = 0; index < Math.min(items.length, limits.maximum); index += 1) {
      const link = items.item(index);
      if (link === null) continue;
      if (result.length >= limits.maximum) break;
      const style = getComputedStyle(link);
      if (style.display === 'none' || style.visibility === 'hidden' || link.getClientRects().length === 0) continue;
      const rawHref = link.getAttribute('href');
      if (rawHref === null || rawHref.length === 0) continue;
      if (!withinByteLimit(rawHref, limits.hrefBytes)) {
        truncated = true;
        continue;
      }
      const href = rawHref.trim();
      if (href.length === 0) continue;
      const rawText = link.textContent;
      const rawAriaLabel = link.getAttribute('aria-label');
      const rawTitle = link.getAttribute('title');
      if (!withinOptionalByteLimit(rawText, limits.fieldBytes) ||
        !withinOptionalByteLimit(rawAriaLabel, limits.fieldBytes) ||
        !withinOptionalByteLimit(rawTitle, limits.fieldBytes)) {
        truncated = true;
        continue;
      }
      const text = boundedField(rawText, limits.fieldBytes);
      const ariaLabel = boundedField(rawAriaLabel, limits.fieldBytes);
      const title = boundedField(rawTitle, limits.fieldBytes);
      try {
        const normalizedHref = new URL(href, document.baseURI).toString();
        if (!withinByteLimit(normalizedHref, limits.hrefBytes)) {
          truncated = true;
          continue;
        }
        const inSidePanel = link.closest('#side-panel') !== null;
        const inFileList = link.closest('table.fileList, .fileList') !== null;
        const candidate: PageLinkCandidate = {
          href: normalizedHref,
          ...(text === undefined ? {} : { text }),
          ...(ariaLabel === undefined ? {} : { ariaLabel }),
          ...(title === undefined ? {} : { title }),
          ...(inSidePanel ? { inSidePanel: true } : {}),
          ...(inFileList ? { inFileList: true } : {}),
        };
        const candidateBytes = encoder.encode(JSON.stringify(candidate)).byteLength;
        if (collectedBytes + candidateBytes > limits.maxBytes) {
          truncated = true;
          break;
        }
        collectedBytes += candidateBytes;
        result.push(candidate);
      } catch { /* Ignore malformed links without aborting evidence capture. */ }
    }
    return { candidates: result, truncated };
  }, {
    maximum: MAX_LINK_CANDIDATES,
    hrefBytes: MAX_LINK_CANDIDATE_HREF_BYTES,
    fieldBytes: MAX_LINK_CANDIDATE_FIELD_BYTES,
    maxBytes: MAX_LINK_DISCOVERY_BYTES,
  });
  return deadline === undefined ? collect() : withWorkflowDeadline(collect, deadline);
}

export async function openScriptSafePage(page: Page, deadline?: WorkflowDeadline): Promise<ScriptSafePage> {
  let session: Awaited<ReturnType<BrowserContext['newCDPSession']>> | undefined;
  try {
    session = await withLateResource(
      () => page.context().newCDPSession(page),
      deadline,
      (lateSession) => settleCleanup(() => lateSession.detach()),
    );
    await bounded(() => session!.send('Emulation.setScriptExecutionDisabled', { value: true }), deadline);
    return {
      page,
      close: async () => {
        await settleCleanup(async () => { await session?.send('Emulation.setScriptExecutionDisabled', { value: false }); });
        await settleCleanup(() => session?.detach() ?? Promise.resolve());
      },
    };
  } catch {
    await settleCleanup(() => session?.detach() ?? Promise.resolve());
    const browser = page.context().browser();
    if (browser === null) throw new Error('Snyk capture cannot disable JavaScript in this browser');
    const storageState = await bounded(() => page.context().storageState(), deadline);
    const context = await withLateResource(
      () => browser.newContext({
        javaScriptEnabled: false,
        storageState,
        viewport: SNYK_VIEWPORT,
      }),
      deadline,
      (lateContext) => settleCleanup(() => lateContext.close()),
    );
    try {
      const safePage = await withLateResource(
        () => context.newPage(),
        deadline,
        (latePage) => settleCleanup(() => latePage.close()),
      );
      return {
        page: safePage,
        close: async () => {
          await settleCleanup(() => context.close());
        },
      };
    } catch (error) {
      await settleCleanup(() => context.close());
      throw error;
    }
  }
}

export interface SnykLandmark {
  readonly locator: Locator;
  readonly strategy: string;
}

export interface SnykScreenshotCapture {
  readonly metadata: Pick<CaptureMetadata, 'screenshotPath' | 'screenshotSha256' | 'viewport'>;
  readonly filename: string;
}

export async function waitForLandmark(
  page: Page,
  project: NormalizedProjectConfig,
  deadline: WorkflowDeadline,
): Promise<SnykLandmark> {
  const semantic = page.getByRole('heading', { name: /Snyk test report/i }).first();
  try {
    await expect(semantic).toBeVisible({ timeout: Math.min(2_000, deadline.requireRemaining()) });
    return { locator: semantic, strategy: 'role:heading name=/Snyk test report/i' };
  } catch { /* Continue down the selector ladder. */ }
  const text = page.getByText('Snyk test report', { exact: true }).first();
  try {
    await expect(text).toBeVisible({ timeout: Math.min(2_000, deadline.requireRemaining()) });
    return { locator: text, strategy: 'text:Snyk test report' };
  } catch { /* Continue down the selector ladder. */ }
  const configured = locatorFor(page, project.selectors.snykReport).first();
  await expect(configured).toBeVisible({ timeout: deadline.requireRemaining() });
  return { locator: configured, strategy: `configured:${selectorDescription(project.selectors.snykReport)}` };
}

export function safeObservedUrl(page: Page, project: NormalizedProjectConfig): string | undefined {
  try {
    return sanitizeUrl(assertAllowedUrl(page.url(), deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl), project.sourceOrigins.snyk, 'Snyk observed URL'));
  } catch { return undefined; }
}

function identityKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

export function snykProjectIdentityWarning(
  metadata: SnykScanMetadata,
  project: NormalizedProjectConfig,
  finalUrl: string,
): string | undefined {
  const expected = project.sources.snyk.projectId;
  if (expected === undefined && new URL(finalUrl).origin !== new URL(deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl)).origin) {
    return 'Snyk project identity is not configured for external evidence';
  }
  if (expected === undefined) return undefined;
  if (metadata.project === undefined || metadata.project.trim().length === 0) {
    return 'Snyk report did not expose the configured project identity';
  }
  return identityKey(metadata.project) === identityKey(expected)
    ? undefined
    : 'Snyk report project identity did not match the configured project';
}


async function readBoundedSummaryBody(
  response: Response,
  controller: AbortController,
  deadline: WorkflowDeadline,
): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const next = await withWorkflowDeadline(() => reader.read(), deadline);
      if (next.done) {
        complete = true;
        break;
      }
      if (next.value === undefined) continue;
      if (next.value.byteLength > MAX_SUMMARY_BYTES - total) {
        throw new Error(`Snyk summary exceeds the ${MAX_SUMMARY_BYTES}-byte limit`);
      }
      total += next.value.byteLength;
      chunks.push(next.value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function fetchSummaryResponse(
  page: Page,
  url: string,
  controller: AbortController,
  deadline: WorkflowDeadline,
): Promise<Response> {
  const cookies = await withWorkflowDeadline(() => page.context().cookies(url), deadline);
  const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  return withWorkflowDeadline(() => fetch(url, {
    redirect: 'manual',
    signal: controller.signal,
    ...(cookieHeader.length === 0 ? {} : { headers: { cookie: cookieHeader } }),
  }), deadline);
}

export async function readSummary(
  page: Page,
  summaryUrl: string,
  project: NormalizedProjectConfig,
  deadline: WorkflowDeadline,
): Promise<SnykSummaryEvidence> {
  let nextUrl = assertAllowedUrl(summaryUrl, deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl), project.sourceOrigins.snyk, 'Snyk summary URL');
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), deadline.requireRemaining());
  try {
    for (let redirect = 0; redirect <= MAX_SUMMARY_REDIRECTS; redirect += 1) {
      const response = await fetchSummaryResponse(page, nextUrl, controller, deadline);
      assertAllowedUrl(response.url, deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl), project.sourceOrigins.snyk, 'Snyk summary URL');
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location === null) throw new Error('Snyk summary redirect has no Location header');
        if (response.body !== null) void response.body.cancel().catch(() => undefined);
        nextUrl = assertAllowedUrl(new URL(location, nextUrl).toString(), deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl), project.sourceOrigins.snyk, 'Snyk summary redirect');
        continue;
      }
      if (response.status >= 400) throw new Error(`Snyk summary returned HTTP ${response.status}`);
      const declaredLengthHeader = response.headers.get('content-length')?.trim();
      if (declaredLengthHeader === undefined || !/^\d+$/u.test(declaredLengthHeader)) {
        throw new Error('Snyk summary response has no valid Content-Length');
      }
      const declaredLength = Number(declaredLengthHeader);
      if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_SUMMARY_BYTES) {
        throw new Error(`Snyk summary exceeds the ${MAX_SUMMARY_BYTES}-byte limit`);
      }
      const body = await readBoundedSummaryBody(response, controller, deadline);
      if (body.byteLength > MAX_SUMMARY_BYTES) {
        throw new Error(`Snyk summary exceeds the ${MAX_SUMMARY_BYTES}-byte limit`);
      }
      return { parsed: parseSnykSummaryJson(new TextDecoder().decode(body)), url: nextUrl };
    }
    throw new Error('Snyk summary exceeded the redirect limit');
  } finally {
    clearTimeout(abortTimer);
    controller.abort();
  }
}

export async function screenshotReport(
  page: Page,
  outputDirectory: string,
  deadline: WorkflowDeadline,
): Promise<SnykScreenshotCapture> {
  await withWorkflowDeadline(() => page.evaluate(() => window.scrollTo(0, 0)), deadline);
  const screenshotPath = path.join(outputDirectory, SNYK_SCREENSHOT_NAME);
  let captured = false;
  let screenshotError: unknown;
  for (let attempt = 0; attempt < MAX_SCREENSHOT_ATTEMPTS; attempt += 1) {
    try {
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        scale: 'css',
        animations: 'disabled',
        timeout: deadline.requireRemaining(),
      });
      captured = true;
      break;
    } catch (error) {
      screenshotError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt + 1 >= MAX_SCREENSHOT_ATTEMPTS || !/Protocol error|captureScreenshot|Unable to capture screenshot/iu.test(message)) break;
      try { deadline.requireRemaining(); } catch { break; }
    }
  }
  if (!captured) throw screenshotError ?? new Error('Snyk report screenshot failed without a diagnostic');
  const screenshotBytes = await withWorkflowDeadline(() => fs.readFile(screenshotPath), deadline);
  const hash = crypto.createHash('sha256').update(screenshotBytes).digest('hex');
  return {
    metadata: { screenshotPath: SNYK_SCREENSHOT_NAME, screenshotSha256: hash, viewport: SNYK_VIEWPORT },
    filename: SNYK_SCREENSHOT_NAME,
  };
}

export function captureFailureMessage(error: unknown): string {
  return formatDiagnostic(error);
}
