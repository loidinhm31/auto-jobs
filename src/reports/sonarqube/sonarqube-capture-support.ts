import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Locator, Page, Route } from '@playwright/test';

import { formatDiagnostic } from '../../config-errors.js';
import type { NormalizedProjectConfig } from '../../config/config-types.js';
import type { CaptureMetadata, NavigationTarget } from '../../result-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import { exactQueryValue, hasCredentialFreeAuthority } from './sonarqube-url-identity.js';

export const SONAR_VIEWPORT = { width: 1_440, height: 900 } as const;
export const SONAR_SCREENSHOTS = {
  overall: 'sonarqube-overall.png',
  issues: 'sonarqube-issues.png',
} as const;

export function terminalIdentity(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}${url.search}`;
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

export function assertProjectUrl(value: string, expectedKey: string, label: string): string {
  const url = new URL(value);
  if (!hasCredentialFreeAuthority(url) || exactQueryValue(url, 'id') !== expectedKey) throw new Error(`SonarQube ${label} has the wrong project identity`);
  if (/\/login(?:\/|$)/iu.test(url.pathname)) throw new Error(`SonarQube ${label} redirected to login`);
  if ((label === 'home' || label === 'Overview') && !/\/dashboard\/?$/iu.test(url.pathname)) {
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
  await region.scrollIntoViewIfNeeded({ timeout: deadline.requireRemaining() });
  const screenshotPath = path.join(outputDirectory, filename);
  await region.screenshot({
    path: screenshotPath,
    animations: 'disabled',
    timeout: deadline.requireRemaining(),
  });
  const hash = crypto.createHash('sha256').update(await fs.readFile(screenshotPath)).digest('hex');
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
  await first.scrollIntoViewIfNeeded({ timeout: deadline.requireRemaining() });
  await second.scrollIntoViewIfNeeded({ timeout: deadline.requireRemaining() });
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  if (firstBox === null || secondBox === null) throw new Error('SonarQube Type/Severity facet bounds were unavailable');
  const left = Math.floor(Math.min(firstBox.x, secondBox.x));
  const top = Math.floor(Math.min(firstBox.y, secondBox.y));
  const right = Math.ceil(Math.max(firstBox.x + firstBox.width, secondBox.x + secondBox.width));
  const bottom = Math.ceil(Math.max(firstBox.y + firstBox.height, secondBox.y + secondBox.height));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) throw new Error('SonarQube Type/Severity facet bounds were empty');
  const screenshotPath = path.join(outputDirectory, filename);
  await page.screenshot({
    path: screenshotPath,
    clip: { x: left, y: top, width, height },
    animations: 'disabled',
    timeout: deadline.requireRemaining(),
  });
  const hash = crypto.createHash('sha256').update(await fs.readFile(screenshotPath)).digest('hex');
  return { screenshotPath: filename, screenshotSha256: hash, viewport: SONAR_VIEWPORT };
}

export async function pageCaptureMetadata(
  page: Page,
  url: string,
  selectorStrategy: string,
  screenshot?: Pick<CaptureMetadata, 'screenshotPath' | 'screenshotSha256' | 'viewport'>,
): Promise<CaptureMetadata> {
  const title = (await page.title()).trim();
  return {
    url,
    ...(title.length === 0 ? {} : { title: title.slice(0, 512) }),
    capturedAt: new Date().toISOString(),
    selectorStrategy: selectorStrategy.slice(0, 256),
    ...(screenshot === undefined ? {} : screenshot),
  };
}

export function createRouteHandler(
  project: NormalizedProjectConfig,
  state: { blocked: boolean },
): (route: Route) => Promise<void> {
  return async (route) => {
    try {
      assertAllowedUrl(
        route.request().url(),
        project.baseUrl,
        project.sourceOrigins.sonarqube,
        'SonarQube request URL',
      );
    } catch {
      state.blocked = true;
      await route.abort('blockedbyclient');
      return;
    }
    if (['font', 'image', 'media', 'worker', 'websocket'].includes(route.request().resourceType())) {
      await route.abort();
      return;
    }
    await route.fallback();
  };
}

export function captureFailureMessage(error: unknown): string {
  return formatDiagnostic(error);
}
