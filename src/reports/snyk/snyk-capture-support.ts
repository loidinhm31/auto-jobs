import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../config/config-types.js';
import type { BuildReference } from '../../types.js';
import { formatDiagnostic, sanitizeUrl } from '../../config-errors.js';
import type { CaptureMetadata, SnykScanMetadata } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import {
  locatorFor,
  selectorDescription,
} from '../../jenkins/locators.js';
import type { PageLinkCandidate } from '../source-link-classifier.js';
import { isJenkinsArtifactPathForBuild } from '../../jenkins/url-identity.js';
import { MAX_SUMMARY_BYTES, parseSnykSummaryJson, type ParsedSnykSummary } from './snyk-summary-parser.js';

export const SNYK_VIEWPORT = { width: 1_440, height: 900 } as const;
export const SNYK_SCREENSHOT_NAME = 'snyk-test-report.png';
const MAX_LINK_CANDIDATES = 256;
const MAX_SUMMARY_REDIRECTS = 5;
const MAX_SCREENSHOT_ATTEMPTS = 3;

export interface SnykSummaryEvidence {
  parsed: ParsedSnykSummary;
  url: string;
}

export interface ScriptSafePage {
  page: Page;
  close: () => Promise<void>;
}

export async function pageLinkCandidates(page: Page): Promise<PageLinkCandidate[]> {
  return page.evaluate((maximum) => {
    const result: PageLinkCandidate[] = [];
    const items = document.querySelectorAll('a[href]');
    for (let index = 0; index < Math.min(items.length, maximum); index += 1) {
      const link = items.item(index);
      if (link === null) continue;
      if (result.length >= maximum) break;
      const style = getComputedStyle(link);
      if (style.display === 'none' || style.visibility === 'hidden' || link.getClientRects().length === 0) continue;
      const href = link.getAttribute('href');
      if (href === null || href.trim().length === 0) continue;
      try {
        result.push({
          href: new URL(href, document.baseURI).toString(),
          ...(link.textContent?.trim() ? { text: link.textContent.trim() } : {}),
          ...(link.getAttribute('aria-label') ? { ariaLabel: link.getAttribute('aria-label') as string } : {}),
          ...(link.getAttribute('title') ? { title: link.getAttribute('title') as string } : {}),
        });
      } catch { /* Ignore malformed links without aborting evidence capture. */ }
    }
    return result;
  }, MAX_LINK_CANDIDATES);
}

export async function openScriptSafePage(page: Page): Promise<ScriptSafePage> {
  let session: Awaited<ReturnType<BrowserContext['newCDPSession']>> | undefined;
  try {
    session = await page.context().newCDPSession(page);
    await session.send('Emulation.setScriptExecutionDisabled', { value: true });
    return {
      page,
      close: async () => {
        await session?.send('Emulation.setScriptExecutionDisabled', { value: false });
        await session?.detach();
      },
    };
  } catch {
    try { await session?.detach(); } catch { /* The browser may not expose CDP. */ }
    const browser = page.context().browser();
    if (browser === null) throw new Error('Snyk capture cannot disable JavaScript in this browser');
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
      viewport: SNYK_VIEWPORT,
    });
    const safePage = await context.newPage();
    return { page: safePage, close: () => context.close() };
  }
}

export async function waitForLandmark(
  page: Page,
  project: NormalizedProjectConfig,
  deadline: WorkflowDeadline,
): Promise<{ locator: Locator; strategy: string }> {
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

export function assertSnykUrlMatchesBuild(
  value: string,
  project: NormalizedProjectConfig,
  expectedBuild?: BuildReference,
): void {
  if (expectedBuild === undefined) return;
  const candidate = new URL(value);
  const jenkinsOrigin = new URL(project.sourceOrigins.jenkins).origin;
  if (candidate.origin === jenkinsOrigin && candidate.pathname.includes('/artifact/') &&
    !isJenkinsArtifactPathForBuild(project.jobUrl, value, expectedBuild.number)) {
    throw new Error('Snyk evidence did not belong to the selected Jenkins build');
  }
}

export async function readSummary(
  page: Page,
  summaryUrl: string,
  project: NormalizedProjectConfig,
  deadline: WorkflowDeadline,
  expectedBuild?: BuildReference,
): Promise<SnykSummaryEvidence> {
  let nextUrl = assertAllowedUrl(summaryUrl, deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl), project.sourceOrigins.snyk, 'Snyk summary URL');
  assertSnykUrlMatchesBuild(nextUrl, project, expectedBuild);
  for (let redirect = 0; redirect <= MAX_SUMMARY_REDIRECTS; redirect += 1) {
    const response = await page.request.get(nextUrl, {
      timeout: deadline.requireRemaining(),
      maxRedirects: 0,
    });
    const responseUrl = assertAllowedUrl(response.url(), deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl), project.sourceOrigins.snyk, 'Snyk summary URL');
    assertSnykUrlMatchesBuild(responseUrl, project, expectedBuild);
    if (response.status() >= 300 && response.status() < 400) {
      const location = response.headers().location;
      if (location === undefined) throw new Error('Snyk summary redirect has no Location header');
      nextUrl = assertAllowedUrl(new URL(location, responseUrl).toString(), deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl), project.sourceOrigins.snyk, 'Snyk summary redirect');
      assertSnykUrlMatchesBuild(nextUrl, project, expectedBuild);
      continue;
    }
    if (response.status() >= 400) throw new Error(`Snyk summary returned HTTP ${response.status()}`);
    const declaredLength = Number(response.headers()['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SUMMARY_BYTES) {
      throw new Error(`Snyk summary exceeds the ${MAX_SUMMARY_BYTES}-byte limit`);
    }
    const body = await response.body();
    if (body.byteLength > MAX_SUMMARY_BYTES) {
      throw new Error(`Snyk summary exceeds the ${MAX_SUMMARY_BYTES}-byte limit`);
    }
    return { parsed: parseSnykSummaryJson(new TextDecoder().decode(body)), url: responseUrl };
  }
  throw new Error('Snyk summary exceeded the redirect limit');
}

export async function screenshotReport(
  page: Page,
  outputDirectory: string,
  deadline: WorkflowDeadline,
): Promise<{ metadata: Pick<CaptureMetadata, 'screenshotPath' | 'screenshotSha256' | 'viewport'>; filename: string }> {
  await page.evaluate(() => window.scrollTo(0, 0));
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
  const hash = crypto.createHash('sha256').update(await fs.readFile(screenshotPath)).digest('hex');
  return {
    metadata: { screenshotPath: SNYK_SCREENSHOT_NAME, screenshotSha256: hash, viewport: SNYK_VIEWPORT },
    filename: SNYK_SCREENSHOT_NAME,
  };
}

export function captureFailureMessage(error: unknown): string {
  return formatDiagnostic(error);
}
