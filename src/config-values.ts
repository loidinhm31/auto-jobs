import type { BrowserName } from './types.js';

import { ConfigError } from './config-errors.js';
import { assertAllowedUrl } from './security/url-policy.js';

const BROWSER_NAMES: readonly BrowserName[] = [
  'chromium',
  'firefox',
  'webkit',
];

const LOGIN_ENDPOINTS: Record<string, true> = {
  login: true,
  signin: true,
  'sign-in': true,
  j_spring_security_check: true,
  j_acegi_security_check: true,
};

export function normalizeConfiguredUrl(value: string, fieldName = 'URL'): string {
  const input = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ConfigError([`${fieldName} must be an absolute HTTP(S) URL`]);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError([`${fieldName} must use http or https`]);
  }
  if (parsed.hash) {
    throw new ConfigError([`${fieldName} must not contain a fragment`]);
  }
  return assertAllowedUrl(input, parsed.origin, [], fieldName);
}

/**
 * Derive one Jenkins context path shared by the login endpoint and job page.
 */
export function deriveJenkinsBaseUrl(loginUrl: string, jobUrl: string): string {
  const login = new URL(normalizeConfiguredUrl(loginUrl, 'loginUrl'));
  const job = new URL(normalizeConfiguredUrl(jobUrl, 'jobUrl'));
  if (login.origin !== job.origin) {
    throw new ConfigError(['loginUrl and jobUrl must share one Jenkins origin']);
  }
  const loginSegments = login.pathname.split('/').filter(Boolean);
  const jobSegments = job.pathname.split('/').filter(Boolean);
  const lastLoginSegment = loginSegments.at(-1)?.toLowerCase();
  const baseSegments = lastLoginSegment !== undefined && LOGIN_ENDPOINTS[lastLoginSegment] === true
    ? loginSegments.slice(0, -1)
    : loginSegments;
  if (!baseSegments.every((segment, index) => jobSegments[index] === segment)) {
    throw new ConfigError(['loginUrl and jobUrl must share one Jenkins base context']);
  }
  const basePath = baseSegments.length === 0 ? '' : `/${baseSegments.join('/')}`;
  return `${login.origin}${basePath}`;
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
