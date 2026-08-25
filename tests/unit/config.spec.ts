import { expect, test } from '@playwright/test';

import {
  formatDiagnostic,
  normalizeBaseUrl,
  parseConfig,
  parseSelector,
} from '../../src/config.js';

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    JENKINS_BASE_URL: 'http://127.0.0.1:8080/',
    JENKINS_USERNAME: 'local-admin',
    JENKINS_PASSWORD: 'super-secret-password',
    JENKINS_JOB_PATH: '/folder/Playwright vulnerability report/',
    SONAR_REPORT_SELECTOR:
      '{"kind":"testId","value":"sonarqube-report","required":false}',
    SNYK_REPORT_SELECTOR:
      '{"kind":"testId","value":"snyk-report","required":false}',
  };
}

test('parses a valid environment once and normalizes public paths', () => {
  const config = parseConfig(validEnvironment());

  expect(config.baseUrl).toBe('http://127.0.0.1:8080');
  expect(config.jobPath).toBe('folder/Playwright%20vulnerability%20report');
  expect(config.loginPath).toBe('/login');
  expect(config.triggerMode).toBe('ui');
  expect(config.browser).toBe('chromium');
  expect(config.timeoutMs).toBe(300_000);
  expect(config.pollIntervalMs).toBe(1_000);
  expect(config.selectors.authLandmark.required).toBe(false);
  expect(config.selectors.sonarqubeReport.required).toBe(false);
  expect(config.selectors.snykReport.kind).toBe('testId');
});

test('supports an existing build without requiring a trigger', () => {
  const environment = validEnvironment();
  environment.JENKINS_BUILD_NUMBER = '12';

  expect(parseConfig(environment).buildNumber).toBe(12);
});

test('rejects URL credentials, queries, and fragments', () => {
  expect(() => normalizeBaseUrl('https://user:password@example.test')).toThrow(
    /credentials/u,
  );
  expect(() => normalizeBaseUrl('https://example.test/?token=secret')).toThrow(
    /query/u,
  );
  expect(() => normalizeBaseUrl('https://example.test/#secret')).toThrow(
    /query/u,
  );
});

test('rejects invalid durations, enums, and selector shapes', () => {
  const environment = validEnvironment();
  environment.JENKINS_TIMEOUT_MS = '0';
  environment.JENKINS_POLL_INTERVAL_MS = '-1';
  environment.JENKINS_TRIGGER_MODE = 'api';
  environment.PLAYWRIGHT_BROWSER = 'safari';
  environment.SONAR_REPORT_SELECTOR = '{"kind":"unsupported","value":"x"}';

  expect(() => parseConfig(environment)).toThrow(/invalid/u);
  expect(() => parseSelector('{"kind":"css"}', 'REPORT_SELECTOR')).toThrow(
    /value/u,
  );
});

test('rejects invalid job paths and preserves no secret in config errors', () => {
  const environment = validEnvironment();
  environment.JENKINS_JOB_PATH = 'https://jenkins.example/job/demo?token=secret';

  let message = '';
  try {
    parseConfig(environment);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  expect(message).toContain('JENKINS_JOB_PATH');
  expect(message).not.toContain(environment.JENKINS_PASSWORD ?? '');
});

test('redacts supplied secrets and sensitive URL data from diagnostics', () => {
  const diagnostic = formatDiagnostic(
    new Error(
      'request https://user:password@example.test/?token=secret authorization: Bearer abc123',
    ),
    ['password', 'secret', 'abc123'],
  );

  expect(diagnostic).not.toContain('password');
  expect(diagnostic).not.toContain('abc123');
  expect(diagnostic).toContain('[REDACTED]');
});
