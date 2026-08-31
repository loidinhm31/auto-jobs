import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  assertAllowedUrl,
  assertProjectConfigDocument,
  canonicalizeBaseUrl,
  canonicalizeOrigin,
  deriveJenkinsBaseUrl,
  loadProjectConfig,
  normalizeConfiguredUrl,
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
  expect(projects.map((project) => project.id)).toEqual(['service-a', 'service-b']);
  expect(projects.every((project) => Object.isFrozen(project))).toBe(true);
  expect(projects[0]?.sources.snyk.projectId).toBe('service-a');
  expect(projects[0]?.sources.snyk).not.toHaveProperty('reportPath');
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
