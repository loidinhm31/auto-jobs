import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  assertAllowedUrl,
  assertProjectConfigDocument,
  canonicalizeBaseUrl,
  canonicalizeOrigin,
  loadProjectConfig,
  parseProjectsConfig,
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
      pollIntervalMs: 100,
    },
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        baseUrl: 'https://jenkins.example/jenkins/',
        jobPath: 'Container Platform/service-a/release%252Fsit',
        sourceOrigins: {
          snyk: ['https://snyk.example'],
          sonarqube: ['https://sonar.example'],
        },
        sonarqube: {
          homeUrl: 'https://sonar.example/dashboard?id=service-a',
        },
      },
      {
        id: 'service-b',
        name: 'Service B',
        baseUrl: 'https://jenkins.example/jenkins',
        jobPath: 'service-b',
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

test('loads enabled projects in declared order and normalizes nested Jenkins paths', () => {
  const filePath = writeConfig(validDocument());
  try {
    const projects = loadProjectConfig(filePath, secrets);
    expect(projects.map((project) => project.id)).toEqual(['service-a', 'service-b']);
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
  expect(projects[0]?.sources.snyk.reportPath).toBe(
    'https://jenkins.example.invalid/jenkins/artifact/snyk-results.html',
  );
  expect(projects[0]?.sources.snyk.projectId).toBe('service-a');
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
    expect(() => loadProjectConfig(filePath, { JENKINS_USERNAME: 'user-a' })).toThrow(
      /JENKINS_PASSWORD/u,
    );
    expect(() => loadProjectConfig(filePath, { JENKINS_USERNAME: 'user-a' })).not.toThrow(
      'password-a',
    );
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('rejects unsafe schema, embedded credentials, and mixed modes', () => {
  expect(() => assertProjectConfigDocument({ schemaVersion: 2, projects: [] })).toThrow(
    /schemaVersion/u,
  );
  expect(() => assertProjectConfigDocument({
    schemaVersion: 1,
    projects: [
      { id: '../escape', name: 'bad', baseUrl: 'https://jenkins.example', jobPath: 'job' },
      { id: 'same', name: 'one', baseUrl: 'https://jenkins.example', jobPath: 'one', credentials: { username: 'secret' } },
      { id: 'same', name: 'two', baseUrl: 'https://jenkins.example', jobPath: 'two' },
    ],
  })).toThrow(/credential values|safe characters|duplicate/u);

  const filePath = writeConfig(validDocument());
  try {
    expect(() => parseProjectsConfig({
      PROJECTS_CONFIG_PATH: filePath,
      JENKINS_BASE_URL: 'https://legacy.example',
    })).toThrow(/combined/u);
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('normalizes legacy inputs into one project and records deprecation', () => {
  const result = parseProjectsConfig({
    JENKINS_BASE_URL: 'https://jenkins.example/jenkins',
    JENKINS_USERNAME: 'legacy-user',
    JENKINS_PASSWORD: 'legacy-password',
    JENKINS_JOB_PATH: 'folder/release%252Fsit',
    PROJECT_ID: 'legacy-service',
    PROJECT_NAME: 'Legacy Service',
  });
  expect(result.mode).toBe('legacy');
  expect(result.projects).toHaveLength(1);
  expect(result.projects[0]?.id).toBe('legacy-service');
  expect(result.diagnostics[0]).toMatch(/deprecated/u);
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
