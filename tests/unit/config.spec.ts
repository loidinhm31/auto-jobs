import { expect, test } from '@playwright/test';
import type { ProjectConfigDocumentV1 } from '../../src/config/config-types.js';

import {
  assertProjectConfigDocument,
  deriveJenkinsBaseUrl,
  formatDiagnostic,
  normalizeConfiguredUrl,
  normalizeProjectConfigDocument,
} from '../../src/config.js';
import { parseReportArguments } from '../../src/cli.js';

function validDocument(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    defaults: {
      credentials: {
        usernameVariable: 'JENKINS_USERNAME',
        passwordVariable: 'JENKINS_PASSWORD',
      },
      timeoutMs: 30_000,
      browser: 'chromium',
      artifactDir: 'reports',
    },
    projects: [{
      id: 'service-a',
      name: 'Service A',
      loginUrl: 'https://jenkins.example/jenkins/login',
      jobUrl: 'https://jenkins.example/jenkins/job/service-a/',
      sourceOrigins: {
        jenkins: ['https://jenkins.example'],
        snyk: ['https://snyk.example'],
        sonarqube: ['https://sonar.example'],
      },
      selectors: {
        authLandmark: {
          kind: 'role',
          value: 'link',
          name: 'Manage Jenkins',
          required: false,
        },
      },
      snyk: { projectId: 'service-a' },
      sonarqube: { projectId: 'service-a' },
    }],
  };
}

const secrets = {
  JENKINS_USERNAME: 'local-admin',
  JENKINS_PASSWORD: 'super-secret-password',
};

test('normalizes exact URLs, defaults, selectors, and runtime-only credentials', () => {
  const [config] = normalizeProjectConfigDocument(validDocument(), secrets);

  expect(config?.loginUrl).toBe('https://jenkins.example/jenkins/login');
  expect(config?.jobUrl).toBe('https://jenkins.example/jenkins/job/service-a/');
  expect(config?.timeoutMs).toBe(30_000);
  expect(config?.browser).toBe('chromium');
  expect(config?.artifactDir).toMatch(/reports$/u);
  expect(config?.selectors.authLandmark.required).toBe(false);
  expect(config?.selectors.sonarqubeReport.value).toBe('sonarqube-report');
  expect(config?.selectors.snykReport.value).toBe('snyk-report');
  expect(config).not.toHaveProperty('baseUrl');
  expect(config).not.toHaveProperty('username');
  expect(config).not.toHaveProperty('password');
});

test('parses only an explicit config path', () => {
  expect(parseReportArguments(['--config', 'config/projects.json'])).toEqual({
    configPath: 'config/projects.json',
  });
  expect(() => parseReportArguments([])).toThrow(/--config <path>/u);
  expect(() => parseReportArguments(['--config', 'one.json', '--config', 'two.json'])).toThrow(
    /duplicate/u,
  );
  expect(() => parseReportArguments(['--unknown', 'value'])).toThrow(/unknown option/u);
  expect(() => parseReportArguments(['config/projects.json'])).toThrow(/positional/u);
  expect(() => parseReportArguments(['--config'])).toThrow(/requires a path/u);
});

test('requires credential-free HTTP(S) URLs and a shared Jenkins context', () => {
  expect(deriveJenkinsBaseUrl(
    'https://jenkins.example/jenkins/login',
    'https://jenkins.example/jenkins/job/service-a/',
  )).toBe('https://jenkins.example/jenkins');
  expect(() => normalizeConfiguredUrl(
    'https://user:password@example.test/jenkins/login',
    'loginUrl',
  )).toThrow(/credentials/u);
  expect(() => normalizeConfiguredUrl(
    'https://example.test/jenkins/job/service-a?token=secret',
    'jobUrl',
  )).toThrow(/credential-like/u);
  expect(() => normalizeConfiguredUrl(
    'https://example.test/jenkins/login#secret',
    'loginUrl',
  )).toThrow(/fragment/u);
  expect(() => deriveJenkinsBaseUrl(
    'https://jenkins.example/jenkins/login',
    'https://jenkins.example/other/job/service-a/',
  )).toThrow(/base context/u);
});

test('rejects legacy fields, invalid options, and unsafe selectors', () => {
  const document = validDocument();
  expect(() => assertProjectConfigDocument({
    ...document,
    projects: [{
      ...document.projects[0],
      baseUrl: 'https://jenkins.example',
      jobPath: 'service-a',
    }],
  })).toThrow(/not supported/u);
  expect(() => assertProjectConfigDocument({
    ...document,
    defaults: { ...document.defaults, browser: 'safari' },
  })).toThrow(/browser/u);
  expect(() => assertProjectConfigDocument({
    ...document,
    projects: [{
      ...document.projects[0],
      selectors: { authLandmark: { kind: 'css' } },
    }],
  })).toThrow(/selector/u);
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
