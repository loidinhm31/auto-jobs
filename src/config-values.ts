import type { BrowserName } from './types.js';

import { ConfigError } from './config-errors.js';
import {
  canonicalizeBaseUrl,
  containsPathTraversal,
} from './security/url-policy.js';
import { resolveSafeRelativeUrl } from './security/relative-url-policy.js';

const BROWSER_NAMES: readonly BrowserName[] = [
  'chromium',
  'firefox',
  'webkit',
];

function normalizePathSegment(segment: string, fieldName: string): string {
  if (containsPathTraversal(segment)) {
    throw new ConfigError([`${fieldName} contains an invalid path segment`]);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new ConfigError([`${fieldName} contains an invalid encoded segment`]);
  }
  if (
    decoded === '.' ||
    decoded === '..' ||
    decoded.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(decoded)
  ) {
    throw new ConfigError([`${fieldName} contains an invalid path segment`]);
  }
  return encodeURIComponent(decoded);
}

export function normalizeBaseUrl(value: string): string {
  return canonicalizeBaseUrl(value, 'JENKINS_BASE_URL');
}

export function resolveBasePathUrl(
  baseUrl: string,
  relativePath: string,
): string {
  return resolveSafeRelativeUrl(baseUrl, relativePath, 'relative path');
}

export function resolveJenkinsJobUrl(baseUrl: string, jobPath: string): string {
  const jobSegments = jobPath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => `job/${segment}`)
    .join('/');
  return resolveBasePathUrl(baseUrl, `/${jobSegments}/`);
}

export function getOptionalBaseUrl(value: string | undefined): string | undefined {
  const input = value?.trim();
  return input === undefined || input.length === 0
    ? undefined
    : normalizeBaseUrl(input);
}

export function normalizeLoginPath(value: string): string {
  const input = value.trim();
  if (
    !input.startsWith('/') ||
    input.startsWith('//') ||
    input.includes('?') ||
    input.includes('#')
  ) {
    throw new ConfigError(['JENKINS_LOGIN_PATH must be a relative path']);
  }

  const segments = input
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => normalizePathSegment(segment, 'JENKINS_LOGIN_PATH'));
  return `/${segments.join('/')}`;
}

export function normalizeJobPath(value: string): string {
  const input = value.trim();
  if (
    input.length === 0 ||
    input.includes('?') ||
    input.includes('#') ||
    /^https?:\/\//iu.test(input)
  ) {
    throw new ConfigError(['JENKINS_JOB_PATH must be a relative job path']);
  }

  const segments = input
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => normalizePathSegment(segment, 'JENKINS_JOB_PATH'));
  if (segments.length === 0) {
    throw new ConfigError(['JENKINS_JOB_PATH must contain a job name']);
  }
  return segments.join('/');
}

export function parsePositiveInteger(
  value: string,
  fieldName: string,
): number {
  const input = value.trim();
  if (!/^\d+$/u.test(input)) {
    throw new ConfigError([`${fieldName} must be a positive integer`]);
  }
  const parsed = Number(input);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError([`${fieldName} must be a positive integer`]);
  }
  return parsed;
}

export function parseBrowserName(value: string | undefined): BrowserName {
  const input = value?.trim() || 'chromium';
  if (!BROWSER_NAMES.includes(input as BrowserName)) {
    throw new ConfigError([
      `PLAYWRIGHT_BROWSER must be one of ${BROWSER_NAMES.join(', ')}`,
    ]);
  }
  return input as BrowserName;
}
