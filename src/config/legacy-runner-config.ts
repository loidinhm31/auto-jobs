import * as path from 'node:path';

import {
  ConfigError,
  formatDiagnostic,
  redactText,
  sanitizeUrl,
} from '../config-errors.js';
import {
  getOptionalBaseUrl,
  normalizeBaseUrl,
  normalizeJobPath,
  normalizeLoginPath,
  parseBrowserName,
  parsePositiveInteger,
  resolveBasePathUrl,
  resolveJenkinsJobUrl,
} from '../config-values.js';
import { parseSelector } from '../config-selectors.js';
import { parseSelectorConfig } from '../config-selector-contract.js';
import type {
  BrowserName,
  SelectorConfig,
  TriggerMode,
} from '../types.js';

export interface RunnerConfig {
  baseUrl: string;
  username: string;
  password: string;
  loginPath: string;
  jobPath: string;
  triggerMode: TriggerMode;
  selectors: SelectorConfig;
  timeoutMs: number;
  pollIntervalMs: number;
  browser: BrowserName;
  artifactDir: string;
  buildNumber?: number;
}

function readRequired(
  env: NodeJS.ProcessEnv,
  key: string,
  issues: string[],
  trim = true,
): string {
  const raw = env[key];
  const value = trim ? raw?.trim() : raw;
  if (value === undefined || value.length === 0) {
    issues.push(`${key} is required`);
    return '';
  }
  return value;
}

function readOptional(
  env: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const raw = env[key];
  const value = raw?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseOrIssue<T>(
  raw: string | undefined,
  fieldName: string,
  fallback: T,
  parser: (value: string) => T,
  issues: string[],
): T {
  if (raw === undefined) {
    return fallback;
  }
  try {
    return parser(raw);
  } catch {
    issues.push(`${fieldName} is invalid`);
    return fallback;
  }
}

export function parseConfig(
  env: NodeJS.ProcessEnv = process.env,
): RunnerConfig {
  const issues: string[] = [];
  const rawBaseUrl = readRequired(env, 'JENKINS_BASE_URL', issues);
  const username = readRequired(env, 'JENKINS_USERNAME', issues);
  const password = readRequired(env, 'JENKINS_PASSWORD', issues, false);
  const rawJobPath = readRequired(env, 'JENKINS_JOB_PATH', issues);

  const baseUrl = parseOrIssue(
    rawBaseUrl || undefined,
    'JENKINS_BASE_URL',
    '',
    normalizeBaseUrl,
    issues,
  );
  const jobPath = parseOrIssue(
    rawJobPath || undefined,
    'JENKINS_JOB_PATH',
    '',
    normalizeJobPath,
    issues,
  );
  const loginPath = parseOrIssue(
    readOptional(env, 'JENKINS_LOGIN_PATH') || '/login',
    'JENKINS_LOGIN_PATH',
    '/login',
    normalizeLoginPath,
    issues,
  );

  const rawBuildNumber = readOptional(env, 'JENKINS_BUILD_NUMBER');
  const buildNumber = rawBuildNumber
    ? parseOrIssue(
        rawBuildNumber,
        'JENKINS_BUILD_NUMBER',
        undefined,
        (value) => parsePositiveInteger(value, 'JENKINS_BUILD_NUMBER'),
        issues,
      )
    : undefined;
  const timeoutMs = parseOrIssue(
    readOptional(env, 'JENKINS_TIMEOUT_MS') || String(300_000),
    'JENKINS_TIMEOUT_MS',
    300_000,
    (value) => parsePositiveInteger(value, 'JENKINS_TIMEOUT_MS'),
    issues,
  );
  const pollIntervalMs = parseOrIssue(
    readOptional(env, 'JENKINS_POLL_INTERVAL_MS') || String(1_000),
    'JENKINS_POLL_INTERVAL_MS',
    1_000,
    (value) => parsePositiveInteger(value, 'JENKINS_POLL_INTERVAL_MS'),
    issues,
  );
  const browser = parseOrIssue(
    readOptional(env, 'PLAYWRIGHT_BROWSER'),
    'PLAYWRIGHT_BROWSER',
    'chromium' as BrowserName,
    parseBrowserName,
    issues,
  );

  const rawTriggerMode = readOptional(env, 'JENKINS_TRIGGER_MODE') || 'ui';
  const triggerMode: TriggerMode = 'ui';
  if (rawTriggerMode !== 'ui') {
    issues.push('JENKINS_TRIGGER_MODE must be ui for V1');
  }

  const selectors = parseSelectorConfig(env, issues, readOptional);

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  const config: RunnerConfig = {
    baseUrl,
    username,
    password,
    loginPath,
    jobPath,
    triggerMode,
    selectors,
    timeoutMs,
    pollIntervalMs,
    browser,
    artifactDir: path.resolve(readOptional(env, 'ARTIFACT_DIR') || 'reports'),
  };
  if (buildNumber !== undefined) {
    config.buildNumber = buildNumber;
  }
  return config;
}

export {
  ConfigError,
  formatDiagnostic,
  getOptionalBaseUrl,
  normalizeBaseUrl,
  normalizeJobPath,
  normalizeLoginPath,
  parseBrowserName,
  parsePositiveInteger,
  parseSelector,
  redactText,
  resolveBasePathUrl,
  resolveJenkinsJobUrl,
  sanitizeUrl,
};
