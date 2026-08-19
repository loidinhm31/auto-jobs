import type { BrowserName } from './types.js';

import { ConfigError } from './config-errors.js';

const BROWSER_NAMES: readonly BrowserName[] = [
  'chromium',
  'firefox',
  'webkit',
];

function normalizePathSegment(segment: string, fieldName: string): string {
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
    /[\u0000\r\n]/u.test(decoded)
  ) {
    throw new ConfigError([`${fieldName} contains an invalid path segment`]);
  }
  return encodeURIComponent(decoded);
}

export function normalizeBaseUrl(value: string): string {
  const input = value.trim();
  if (input.length === 0) {
    throw new ConfigError(['JENKINS_BASE_URL is required']);
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ConfigError(['JENKINS_BASE_URL must be an absolute URL']);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(['JENKINS_BASE_URL must use http or https']);
  }
  if (url.username || url.password) {
    throw new ConfigError(['JENKINS_BASE_URL must not contain credentials']);
  }
  if (url.search || url.hash) {
    throw new ConfigError(['JENKINS_BASE_URL must not contain query or fragment']);
  }

  url.pathname = url.pathname.replace(/\/+$/u, '');
  return url.toString().replace(/\/$/u, '');
}

export function getOptionalBaseUrl(value: string | undefined): string | undefined {
  const input = value?.trim();
  return input === undefined || input.length === 0
    ? undefined
    : normalizeBaseUrl(input);
}

export function normalizeLoginPath(value: string): string {
  const input = value.trim();
  if (!input.startsWith('/') || input.includes('?') || input.includes('#')) {
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
