import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  DEFAULT_REPORT_WORKERS,
  MAX_REPORT_WORKERS,
  assertAllowedUrl,
  assertProjectConfigDocument,
  canonicalizeBaseUrl,
  canonicalizeOrigin,
  deriveJenkinsBaseUrl,
  loadProjectConfig,
  loadProjectConfigWithDocument,
  normalizeConfiguredUrl,
  normalizeReportWorkerCount,
  resolveProjectSecrets,
  resolveSafeRelativeUrl,
} from '../../src/config.js';
import type { NormalizedProjectConfig } from '../../src/types.js';

function writeConfig(value: unknown): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-config-'));
  const filePath = path.join(directory, 'projects.json');
  fs.writeFileSync(filePath, JSON.stringify(value), { mode: 0o600 });
  return filePath;
}

function validDocument() {
  return {
    schemaVersion: 1,
    defaults: {
      credentials: {
        usernameVariable: 'JENKINS_USERNAME',
        passwordVariable: 'JENKINS_PASSWORD',
      },
      timeoutMs: 30_000,
    },
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/Container%20Platform/job/service-a/job/release%252Fsit/',
        sourceOrigins: {
          jenkins: ['https://jenkins.example'],
          snyk: ['https://snyk.example'],
          sonarqube: ['https://sonar.example'],
        },
        sonarqube: {
          projectId: 'service-a',
        },
      },
      {
        id: 'service-b',
        name: 'Service B',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/service-b/',
        credentials: {
          usernameVariable: 'SERVICE_B_USER',
          passwordVariable: 'SERVICE_B_PASSWORD',
        },
      },
    ],
  };
}

const secrets = {
  JENKINS_USERNAME: 'user-a',
  JENKINS_PASSWORD: 'password-a',
  SERVICE_B_USER: 'user-b',
  SERVICE_B_PASSWORD: 'password-b',
};

test('loads enabled projects in declared order with exact Jenkins URLs', () => {
  const filePath = writeConfig(validDocument());
  try {
    const projects = loadProjectConfig(filePath, secrets);
    expect(projects.map((project) => project.id)).toEqual(['service-a', 'service-b']);
    expect(projects[0]?.loginUrl).toBe('https://jenkins.example/jenkins/login');
    expect(projects[0]?.jobUrl).toBe(
      'https://jenkins.example/jenkins/job/Container%20Platform/job/service-a/job/release%252Fsit/',
    );
    expect(projects[0]?.sourceOrigins.sonarqube).toEqual(['https://sonar.example']);
    expect(projects[0]).not.toHaveProperty('username');
    expect(projects[0]).not.toHaveProperty('password');
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('loads the committed two-project example with runtime-only secret values', () => {
  const projects = loadProjectConfig(path.resolve('config/projects.example.json'), {
    JENKINS_USERNAME: 'fixture-user-a',
    JENKINS_PASSWORD: 'fixture-password-a',
    SERVICE_B_JENKINS_USERNAME: 'fixture-user-b',
    SERVICE_B_JENKINS_PASSWORD: 'fixture-password-b',
  });
  expect(projects.map((project) => project.id)).toEqual(['service-a', 'service-b', 'new-project']);
  expect(projects.every((project) => Object.isFrozen(project))).toBe(true);
  expect(projects[0]?.sources.snyk.projectId).toBeUndefined();
  expect(projects[0]?.sources.sonarqube.projectId).toBeUndefined();
  expect(projects[0]?.sources.snyk).not.toHaveProperty('reportPath');
});

test('loads the committed template mock server config with runtime-only secret values', () => {
  const secretsEnv = {
    TEMPLATE_FIXTURE_USERNAME: 'mock-user',
    TEMPLATE_FIXTURE_PASSWORD: 'mock-password',
  };
  const projects = loadProjectConfig(path.resolve('config/projects.template.json'), secretsEnv, true);
  expect(projects.map((project) => project.id)).toEqual(['template-fixture-service']);
  expect(projects.every((project) => Object.isFrozen(project))).toBe(true);
  const project = projects[0] as NormalizedProjectConfig;
  expect(project.loginUrl).toBe('http://127.0.0.1:4174/login');
  expect(project.jobUrl).toBe(
    'http://127.0.0.1:4174/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/',
  );
  expect(project.sourceOrigins.jenkins).toBe('http://127.0.0.1:4174');
  expect(project.sourceOrigins.snyk).toEqual(['http://127.0.0.1:4174']);
  expect(project.sourceOrigins.sonarqube).toEqual(['http://127.0.0.1:4174']);
  expect(project.sources.sonarqube.projectId).toBe(
    'com.example-domain.example-package:com.example-domain.example-package.service',
  );
  expect(project.sources.snyk.projectId).toBeUndefined();
  expect(resolveProjectSecrets(project, secretsEnv)).toEqual({
    username: 'mock-user',
    password: 'mock-password',
  });
  expect(() => loadProjectConfig(path.resolve('config/projects.template.json'), {}, true)).toThrow(
    /TEMPLATE_FIXTURE_USERNAME/u,
  );
  expect(() =>
    loadProjectConfig(
      path.resolve('config/projects.template.json'),
      { TEMPLATE_FIXTURE_USERNAME: 'mock-user' },
      true,
    )
  ).toThrow(/TEMPLATE_FIXTURE_PASSWORD/u);
});

test('uses per-project credential variable overrides and keeps values ephemeral', () => {
  const filePath = writeConfig(validDocument());
  try {
    const projects = loadProjectConfig(filePath, secrets);
    const project = projects[1] as NormalizedProjectConfig;
    expect(project.credentialVariables).toEqual({
      usernameVariable: 'SERVICE_B_USER',
      passwordVariable: 'SERVICE_B_PASSWORD',
    });
    expect(resolveProjectSecrets(project, secrets)).toEqual({
      username: 'user-b',
      password: 'password-b',
    });
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('rejects missing secret references without exposing values', () => {
  const filePath = writeConfig(validDocument());
  try {
    expect(() => loadProjectConfig(filePath, { JENKINS_USERNAME: 'user-a' }, true)).toThrow(
      /JENKINS_PASSWORD/u,
    );
    expect(() => loadProjectConfig(filePath, { JENKINS_USERNAME: 'user-a' }, true)).not.toThrow(
      'password-a',
    );
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('rejects schema-v2 documents, legacy fields, duplicate IDs, and mixed environment modes', () => {
  expect(() => assertProjectConfigDocument({ schemaVersion: 2, projects: [] })).toThrow(
    /schemaVersion/u,
  );
  expect(() => assertProjectConfigDocument({
    schemaVersion: 1,
    projects: [
      {
        id: '../escape',
        name: 'bad',
        baseUrl: 'https://jenkins.example',
        jobPath: 'job',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job',
      },
      {
        id: 'same',
        name: 'one',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/one/',
        credentials: { username: 'secret' },
      },
      {
        id: 'same',
        name: 'two',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/two/',
      },
    ],
  })).toThrow(/not supported|safe characters|duplicate/u);

  const filePath = writeConfig(validDocument());
  try {
    expect(() => loadProjectConfig(filePath, {
      ...secrets,
      PROJECTS_CONFIG_PATH: filePath,
    })).toThrow(/legacy environment configuration/u);
    expect(() => loadProjectConfig(filePath, {
      ...secrets,
      REPORT_SOURCE: 'templates',
    })).toThrow(/legacy environment configuration/u);
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('requires credential-free exact URLs and one Jenkins base context', () => {
  expect(deriveJenkinsBaseUrl(
    'https://jenkins.example/jenkins/login',
    'https://jenkins.example/jenkins/job/service-a/',
  )).toBe('https://jenkins.example/jenkins');
  expect(() => normalizeConfiguredUrl(
    'https://user:password@jenkins.example/jenkins/login',
    'loginUrl',
  )).toThrow(/credentials/u);
  expect(() => normalizeConfiguredUrl(
    'https://jenkins.example/jenkins/job/service-a?token=secret',
    'jobUrl',
  )).toThrow(/credential-like/u);
  expect(() => normalizeConfiguredUrl(
    'https://jenkins.example/jenkins/login#fragment',
    'loginUrl',
  )).toThrow(/fragment/u);
  expect(() => deriveJenkinsBaseUrl(
    'https://jenkins.example/jenkins/login',
    'https://jenkins.example/other/job/service-a/',
  )).toThrow(/base context/u);
});

test('canonicalizes origins and contains relative navigation', () => {
  expect(canonicalizeBaseUrl('https://jenkins.example:443/jenkins/')).toBe(
    'https://jenkins.example/jenkins',
  );
  expect(canonicalizeOrigin('https://sonar.example:443/')).toBe('https://sonar.example');
  expect(resolveSafeRelativeUrl('https://jenkins.example/jenkins', '/job/demo/')).toBe(
    'https://jenkins.example/jenkins/job/demo/',
  );
  expect(() => resolveSafeRelativeUrl('https://jenkins.example/jenkins', '../admin')).toThrow(
    /base context/u,
  );
  expect(() => assertAllowedUrl(
    'https://evil.example/report',
    'https://jenkins.example/jenkins',
    ['https://sonar.example'],
  )).toThrow(/configured origins/u);
});

test('normalizeReportWorkerCount enforces integer 1-4 and default 1', () => {
  expect(DEFAULT_REPORT_WORKERS).toBe(1);
  expect(MAX_REPORT_WORKERS).toBe(4);
  expect(normalizeReportWorkerCount(undefined)).toBe(1);
  expect(normalizeReportWorkerCount(1)).toBe(1);
  expect(normalizeReportWorkerCount(2)).toBe(2);
  expect(normalizeReportWorkerCount(3)).toBe(3);
  expect(normalizeReportWorkerCount(4)).toBe(4);

  for (const invalid of [0, 5, -1, 10, 1.5, NaN, Infinity, -Infinity]) {
    expect(() => normalizeReportWorkerCount(invalid)).toThrow(RangeError);
  }
  for (const invalid of [null, '2', false, true, [], {}]) {
    expect(() => normalizeReportWorkerCount(invalid)).toThrow(RangeError);
  }
});

test('assertProjectConfigDocument validates top-level reportWorkers and rejects invalid or misplaced locations', () => {
  const base = validDocument();
  expect(assertProjectConfigDocument({ ...base, reportWorkers: 1 }).reportWorkers).toBe(1);
  expect(assertProjectConfigDocument({ ...base, reportWorkers: 4 }).reportWorkers).toBe(4);
  expect(assertProjectConfigDocument(base).reportWorkers).toBeUndefined();

  for (const invalid of [0, 5, -1, 1.5, '2', null, false, [], {}]) {
    expect(() => assertProjectConfigDocument({ ...base, reportWorkers: invalid })).toThrow(
      /config\.reportWorkers/u,
    );
  }

  expect(() => assertProjectConfigDocument({
    ...base,
    defaults: { ...base.defaults, reportWorkers: 2 } as unknown as typeof base.defaults,
  })).toThrow(/defaults\.reportWorkers is not supported/u);

  expect(() => assertProjectConfigDocument({
    ...base,
    projects: [{ ...base.projects[0], reportWorkers: 2 }] as unknown as typeof base.projects,
  })).toThrow(/projects\[0\]\.reportWorkers is not supported/u);
});

test('loadProjectConfigWithDocument loads document and projects in one read with parity to loadProjectConfig', () => {
  const base = { ...validDocument(), reportWorkers: 3 };
  const filePath = writeConfig(base);
  try {
    const withDoc = loadProjectConfigWithDocument(filePath);
    const projectsOnly = loadProjectConfig(filePath);
    expect(withDoc.document.reportWorkers).toBe(3);
    expect(withDoc.projects).toEqual(projectsOnly);
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('old schema-v1 JSON without reportWorkers continues to validate and load with default', () => {
  const base = validDocument();
  const filePath = writeConfig(base);
  try {
    const withDoc = loadProjectConfigWithDocument(filePath);
    expect(withDoc.document.reportWorkers).toBeUndefined();
    expect(normalizeReportWorkerCount(withDoc.document.reportWorkers)).toBe(1);
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});
