import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Locator, Page, Route } from '@playwright/test';

import { formatDiagnostic } from '../../config-errors.js';
import type { NormalizedProjectConfig } from '../../config/config-types.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import type { CaptureMetadata, NavigationTarget } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import { exactQueryValue, hasCredentialFreeAuthority, isArchivedSonarqubeArtifact, isArchivedSonarqubeSnapshot, isSonarqubeLoginLocation } from './sonarqube-url-identity.js';
import { WorkflowDeadlineExceededError, withWorkflowDeadline, type WorkflowDeadline } from '../../workflow/workflow-deadline.js';

export const SONAR_VIEWPORT = { width: 1_440, height: 900 } as const;
export const SONAR_SCREENSHOTS = {
  overall: 'sonarqube-overall.png',
  issues: 'sonarqube-issues.png',
} as const;

export async function dismissSonarqubeModals(page: Page): Promise<void> {
  const dismissCandidates = [
    page.getByRole('button', { name: /^got\s*it$/iu }),
    page.getByRole('dialog').getByRole('button', { name: /^got\s*it$/iu }),
    page.getByRole('dialog').getByRole('button', { name: /^dismiss$/iu }),
    page.getByRole('dialog').getByRole('button', { name: /^close$/iu }),
    page.locator('[role="dialog"] button, [data-component*="modal"] button, .sw-modal button').filter({ hasText: /^got\s*it$/iu }),
    page.locator('[role="dialog"] button, [data-component*="modal"] button, .sw-modal button').filter({ hasText: /^(?:dismiss|close)$/iu }),
    page.locator('button').filter({ hasText: /^got\s*it$/iu }),
  ];

  for (const candidate of dismissCandidates) {
    try {
      const count = await candidate.count().catch(() => 0);
      for (let index = 0; index < Math.min(count, 5); index += 1) {
        const button = candidate.nth(index);
        if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
          await button.click({ timeout: 1_000 }).catch(() => undefined);
        }
      }
    } catch {
      // Ignore dismiss errors and continue
    }
  }
}

export function projectKeyFromHome(
  homeUrl: string,
  project: NormalizedProjectConfig,
): string {
  const configured = project.sources.sonarqube.projectId?.trim();
  const url = new URL(homeUrl);
  const fromUrl = exactQueryValue(url, 'id');
  if (!hasCredentialFreeAuthority(url) || fromUrl === undefined) {
    throw new Error('SonarQube home URL has an invalid project identity');
  }
  if (configured !== undefined && configured !== fromUrl) {
    throw new Error('SonarQube configured project identity does not match the home URL');
  }
  const key = configured ?? fromUrl;
  if (key === undefined || key.length === 0) throw new Error('SonarQube home URL has no project identity');
  return key;
}

export function assertProjectUrl(
  value: string,
  expectedKey: string,
  label: string,
  allowArchivedSnapshot = false,
): string {
  const url = new URL(value);
  if (!hasCredentialFreeAuthority(url) || exactQueryValue(url, 'id') !== expectedKey) throw new Error(`SonarQube ${label} has the wrong project identity`);
  if (label === 'Overall' && exactQueryValue(url, 'codeScope') !== 'overall') throw new Error('SonarQube Overall has an invalid code scope');
  if (isSonarqubeLoginLocation(url)) throw new Error(`SonarQube ${label} redirected to login`);
  const dashboardPath = label === 'Overall'
    ? (url.pathname === '/dashboard' || url.pathname === '/dashboard/')
    : /\/dashboard\/?$/iu.test(url.pathname);
  const archivedPath = allowArchivedSnapshot && (
    label === 'Overall'
      ? isArchivedSonarqubeArtifact(url) && /\/sonarqube\/overall\.html$/iu.test(url.pathname)
      : isArchivedSonarqubeSnapshot(url)
  );
  if ((label === 'home' || label === 'Overview' || label === 'Overall') && !dashboardPath && !archivedPath) {
    throw new Error(`SonarQube ${label} is not a project dashboard`);
  }
  return url.toString();
}

export function navigation(
  key: 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues',
  state: NavigationTarget['state'],
  liveUrl?: string,
): NavigationTarget {
  const anchors = {
    'sonarqube-home': '#sonarqube-home',
    'sonarqube-overall': '#sonarqube-overall',
    'sonarqube-issues': '#sonarqube-issues',
  } as const;
  return { key, localAnchor: anchors[key], state, ...(liveUrl === undefined ? {} : { liveUrl }) };
}

export async function screenshotRegion(
  page: Page,
  region: Locator,
  outputDirectory: string,
  filename: string,
  deadline: WorkflowDeadline,
): Promise<Pick<CaptureMetadata, 'screenshotPath' | 'screenshotSha256' | 'viewport'>> {
  await withWorkflowDeadline(() => region.scrollIntoViewIfNeeded({ timeout: deadline.requireRemaining() }), deadline);
  const screenshotPath = path.join(outputDirectory, filename);
  await withWorkflowDeadline(() => region.screenshot({
    path: screenshotPath,
    animations: 'disabled',
    timeout: deadline.requireRemaining(),
  }), deadline);
  const screenshotBytes = await withWorkflowDeadline(() => fs.readFile(screenshotPath), deadline);
  const hash = crypto.createHash('sha256').update(screenshotBytes).digest('hex');
  return { screenshotPath: filename, screenshotSha256: hash, viewport: SONAR_VIEWPORT };
}

export async function screenshotFacetRange(
  page: Page,
  first: Locator,
  second: Locator,
  outputDirectory: string,
  filename: string,
  deadline: WorkflowDeadline,
): Promise<Pick<CaptureMetadata, 'screenshotPath' | 'screenshotSha256' | 'viewport'>> {
  await withWorkflowDeadline(() => first.scrollIntoViewIfNeeded({ timeout: deadline.requireRemaining() }), deadline);
  await withWorkflowDeadline(() => second.scrollIntoViewIfNeeded({ timeout: deadline.requireRemaining() }), deadline);
  const firstBox = await withWorkflowDeadline(() => first.boundingBox(), deadline);
  const secondBox = await withWorkflowDeadline(() => second.boundingBox(), deadline);
  if (firstBox === null || secondBox === null) throw new Error('SonarQube Type/Severity facet bounds were unavailable');
  const left = Math.floor(Math.min(firstBox.x, secondBox.x));
  const top = Math.floor(Math.min(firstBox.y, secondBox.y));
  const right = Math.ceil(Math.max(firstBox.x + firstBox.width, secondBox.x + secondBox.width));
  const bottom = Math.ceil(Math.max(firstBox.y + firstBox.height, secondBox.y + secondBox.height));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) throw new Error('SonarQube Type/Severity facet bounds were empty');
  const screenshotPath = path.join(outputDirectory, filename);
  await withWorkflowDeadline(() => page.screenshot({
    path: screenshotPath,
    clip: { x: left, y: top, width, height },
    animations: 'disabled',
    timeout: deadline.requireRemaining(),
  }), deadline);
  const screenshotBytes = await withWorkflowDeadline(() => fs.readFile(screenshotPath), deadline);
  const hash = crypto.createHash('sha256').update(screenshotBytes).digest('hex');
  return { screenshotPath: filename, screenshotSha256: hash, viewport: SONAR_VIEWPORT };
}

export async function pageCaptureMetadata(
  page: Page,
  url: string,
  selectorStrategy: string,
  deadline: WorkflowDeadline,
  screenshot?: Pick<CaptureMetadata, 'screenshotPath' | 'screenshotSha256' | 'viewport'>,
): Promise<CaptureMetadata> {
  const title = (await withWorkflowDeadline(() => page.title(), deadline)).trim();
  return {
    url,
    ...(title.length === 0 ? {} : { title: title.slice(0, 512) }),
    capturedAt: new Date().toISOString(),
    selectorStrategy: selectorStrategy.slice(0, 256),
    ...(screenshot === undefined ? {} : screenshot),
  };
}

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

export function createRouteHandler(
  project: NormalizedProjectConfig,
  state: { blocked: boolean },
  deadline: WorkflowDeadline,
): (route: Route) => Promise<void> {
  return async (route) => {
    try {
      assertAllowedUrl(
        route.request().url(),
        deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl),
        project.sourceOrigins.sonarqube,
        'SonarQube request URL',
      );
    } catch {
      state.blocked = true;
      await settleRouteAction(() => route.abort('blockedbyclient'), deadline);
      return;
    }
    if (['font', 'image', 'media', 'worker', 'websocket'].includes(route.request().resourceType())) {
      await settleRouteAction(() => route.abort(), deadline);
      return;
    }
    await settleRouteAction(() => route.fallback(), deadline);
  };
}

export function captureFailureMessage(error: unknown): string {
  return formatDiagnostic(error);
}
