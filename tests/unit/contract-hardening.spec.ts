import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  assertAllowedUrl,
  assertProjectConfigDocument,
  canonicalizeBaseUrl,
  loadProjectConfig,
  normalizeConfiguredUrl,
  resolveProjectSecrets,
} from '../../src/config.js';
import {
  hasCompleteNavigationTargets,
  REQUIRED_NAVIGATION_TARGET_KEYS,
} from '../../src/types.js';

function writeConfig(value: unknown): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-config-hardening-'));
  const filePath = path.join(directory, 'projects.json');
  fs.writeFileSync(filePath, JSON.stringify(value), { mode: 0o600 });
  return filePath;
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/service-a/',
        sourceOrigins: {
          jenkins: ['https://jenkins.example'],
        },
        ...overrides,
      },
    ],
  };
}

test('rejects raw and encoded traversal before URL normalization', () => {
  expect(() => canonicalizeBaseUrl('https://jenkins.example/jenkins/../admin')).toThrow(
    /traversal/u,
  );
  expect(() => canonicalizeBaseUrl('https://jenkins.example/jenkins\\..\\admin')).toThrow(
    /traversal/u,
  );
  expect(() => assertAllowedUrl(
    'https://jenkins.example/jenkins/%2e%2e/admin',
    'https://jenkins.example/jenkins',
    ['https://jenkins.example'],
  )).toThrow(/traversal/u);
  expect(() => normalizeConfiguredUrl(
    'https://jenkins.example/jenkins/%2525252525252e%2525252525252e/admin',
    'jobUrl',
  )).toThrow(/traversal/u);
});

test('rejects credential-like query keys without echoing values', () => {
  let errorText = '';
  try {
    assertAllowedUrl(
      'https://sonar.example/project?token=super-secret',
      'https://jenkins.example/jenkins',
      ['https://sonar.example'],
    );
  } catch (error) {
    errorText = String(error);
  }
  expect(errorText).toMatch(/credential-like query/u);
  expect(errorText).not.toContain('super-secret');
  expect(() => assertAllowedUrl(
    'https://sonar.example/project?next=password%3Dsuper-secret',
    'https://jenkins.example/jenkins',
    ['https://sonar.example'],
  )).toThrow(/credential-like query/u);
  expect(() => assertAllowedUrl(
    'https://sonar.example/project?%2574oken=super-secret',
    'https://jenkins.example/jenkins',
    ['https://sonar.example'],
  )).toThrow(/credential-like query/u);
  expect(() => assertAllowedUrl(
    'https://sonar.example/project?next=foo%3Ftoken%3Dsuper-secret',
    'https://jenkins.example/jenkins',
    ['https://sonar.example'],
  )).toThrow(/credential-like query/u);
});

test('prefers trimmed per-project credential variables over default references', () => {
  const filePath = writeConfig({
    schemaVersion: 1,
    defaults: {
      credentials: {
        usernameVariable: ' DEFAULT_USER ',
        passwordVariable: ' DEFAULT_PASS ',
      },
    },
    projects: [project({
      credentials: {
        usernameVariable: ' PROJECT_USER ',
        passwordVariable: ' PROJECT_PASS ',
      },
    }).projects[0]],
  });
  try {
    const env = {
      PROJECT_USER: 'project-user',
      PROJECT_PASS: 'project-password',
      DEFAULT_USER: 'default-user',
      DEFAULT_PASS: 'default-password',
    };
    const [loaded] = loadProjectConfig(filePath, env);
    expect(loaded?.credentialVariables).toEqual({
      usernameVariable: 'PROJECT_USER',
      passwordVariable: 'PROJECT_PASS',
    });
    expect(resolveProjectSecrets(loaded!, env)).toEqual({
      username: 'project-user',
      password: 'project-password',
    });
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('inherits the default requiredness for selector overrides', () => {
  const filePath = writeConfig(project({
    selectors: {
      authLandmark: {
        kind: 'role',
        value: 'link',
        name: 'Manage Jenkins',
      },
    },
  }));
  try {
    const [loaded] = loadProjectConfig(filePath, {
      JENKINS_USERNAME: 'user',
      JENKINS_PASSWORD: 'password',
    });
    expect(loaded?.selectors.authLandmark.required).toBe(true);
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
  expect(() => assertProjectConfigDocument(project({
    selectors: {
      authLandmark: { kind: 'role', value: 'link', unknown: true },
    },
  }))).toThrow(/selector/u);
});

test('rejects file mode mixed with legacy structural environment inputs', () => {
  const filePath = writeConfig(project());
  try {
    for (const key of [
      'PLAYWRIGHT_BROWSER',
      'JENKINS_TRIGGER_SELECTOR',
      'SNYK_ALLOWED_ORIGINS',
      'JENKINS_USERNAME_VARIABLE',
      'PROJECT_ID',
    ]) {
      expect(() => loadProjectConfig(filePath, {
        [key]: key === 'SNYK_ALLOWED_ORIGINS' ? 'https://snyk.example' : 'legacy-value',
      }, false)).toThrow(/legacy environment configuration/u);
    }
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test('requires all five keyed navigation targets', () => {
  const complete = Object.fromEntries(
    REQUIRED_NAVIGATION_TARGET_KEYS.map((key) => [key, {
      key,
      localAnchor: `#${key}`,
      state: 'found',
    }]),
  );
  expect(hasCompleteNavigationTargets(complete)).toBe(true);
  expect(hasCompleteNavigationTargets({ ...complete, extra: complete['jenkins-job'] })).toBe(false);
  delete complete['sonarqube-issues'];
  expect(hasCompleteNavigationTargets(complete)).toBe(false);
  expect(hasCompleteNavigationTargets(Object.values(complete))).toBe(false);
});
