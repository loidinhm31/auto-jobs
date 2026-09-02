import { expect, test } from '@playwright/test';

import {
  assertProjectConfigDocument,
  normalizeProjectConfigDocument,
  selectAutoBuildProject,
  selectReportProjects,
} from '../../src/config.js';
import type { ProjectConfigDefaults, ProjectConfigDocumentV1 } from '../../src/config/config-types.js';

const defaultOptions: ProjectConfigDefaults = {
  credentials: { usernameVariable: 'JENKINS_USERNAME', passwordVariable: 'JENKINS_PASSWORD' },
  timeoutMs: 30_000,
};

function baseDocument(overrides: Record<string, unknown> = {}): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    defaults: defaultOptions,
    projects: [{
      id: 'service-a',
      name: 'Service A',
      loginUrl: 'https://jenkins.example/jenkins/login',
      jobUrl: 'https://jenkins.example/jenkins/job/service-a/',
      sourceOrigins: { jenkins: ['https://jenkins.example'] },
      ...overrides,
    }],
  };
}

const mockSecrets = { JENKINS_USERNAME: 'admin', JENKINS_PASSWORD: 'secret-password' };

test('normalizes missing runType to report by default', () => {
  const [project] = normalizeProjectConfigDocument(baseDocument(), mockSecrets);
  expect(project?.runType).toBe('report');
  expect(project?.enabled).toBe(true);
});

test('accepts explicit report and auto-build runTypes', () => {
  const [reportProject] = normalizeProjectConfigDocument(baseDocument({ runType: 'report' }), mockSecrets);
  expect(reportProject?.runType).toBe('report');

  const [buildProject] = normalizeProjectConfigDocument(baseDocument({ runType: 'auto-build' }), mockSecrets);
  expect(buildProject?.runType).toBe('auto-build');
});

test('rejects invalid, malformed, or casing-mismatched runTypes', () => {
  for (const invalid of ['autobuild', 'REPORT', 'AUTO-BUILD', 123, true]) {
    expect(() => assertProjectConfigDocument(baseDocument({ runType: invalid }))).toThrow(
      /projects\[0\]\.runType must be 'report' or 'auto-build'/u,
    );
  }
});

test('rejects runType when specified in defaults', () => {
  const doc = { ...baseDocument(), defaults: { ...defaultOptions, runType: 'report' } };
  expect(() => assertProjectConfigDocument(doc)).toThrow(/config\.defaults\.runType is not supported/u);
});

test('normalizes default build selectors with required flag', () => {
  const [project] = normalizeProjectConfigDocument(baseDocument(), mockSecrets);
  expect(project?.selectors.buildParametersLink).toEqual({
    kind: 'role', value: 'link', name: 'Build with Parameters', required: true,
  });
  expect(project?.selectors.buildSubmitButton).toEqual({
    kind: 'role', value: 'button', name: 'Build', required: true,
  });
  expect(Object.isFrozen(project?.selectors)).toBe(true);
  expect(Object.isFrozen(project?.selectors.buildParametersLink)).toBe(true);
  expect(Object.isFrozen(project?.selectors.buildSubmitButton)).toBe(true);
});

test('rejects build selector overrides with required: false', () => {
  expect(() => assertProjectConfigDocument(baseDocument({
    selectors: { buildParametersLink: { kind: 'role', value: 'link', name: 'Build with Parameters', required: false } },
  }))).toThrow(/projects\[0\]\.selectors\.buildParametersLink must be required/u);

  expect(() => assertProjectConfigDocument(baseDocument({
    selectors: { buildSubmitButton: { kind: 'role', value: 'button', name: 'Build', required: false } },
  }))).toThrow(/projects\[0\]\.selectors\.buildSubmitButton must be required/u);
});

test('accepts valid custom build selector overrides with required: true', () => {
  const [project] = normalizeProjectConfigDocument(baseDocument({
    selectors: {
      buildParametersLink: { kind: 'role', value: 'link', name: 'Custom Parameter Build', required: true },
      buildSubmitButton: { kind: 'role', value: 'button', name: 'Submit Build', required: true },
    },
  }), mockSecrets);
  expect(project?.selectors.buildParametersLink.name).toBe('Custom Parameter Build');
  expect(project?.selectors.buildSubmitButton.name).toBe('Submit Build');
});

test('selectReportProjects filters out disabled and auto-build projects', () => {
  const doc: ProjectConfigDocumentV1 = {
    schemaVersion: 1,
    defaults: defaultOptions,
    projects: [
      { id: 'report-enabled', name: 'Report Enabled', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/report-enabled/', runType: 'report', enabled: true },
      { id: 'report-disabled', name: 'Report Disabled', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/report-disabled/', runType: 'report', enabled: false },
      { id: 'build-enabled', name: 'Build Enabled', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/build-enabled/', runType: 'auto-build', enabled: true },
    ],
  };
  const normalized = normalizeProjectConfigDocument(doc, mockSecrets);
  const selected = selectReportProjects(normalized);
  expect(selected.map((p) => p.id)).toEqual(['report-enabled']);
  expect(Object.isFrozen(selected)).toBe(true);
});

test('selectReportProjects fails when no enabled report projects exist', () => {
  const doc: ProjectConfigDocumentV1 = {
    schemaVersion: 1,
    defaults: defaultOptions,
    projects: [
      { id: 'build-enabled', name: 'Build Enabled', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/build-enabled/', runType: 'auto-build', enabled: true },
    ],
  };
  const normalized = normalizeProjectConfigDocument(doc, mockSecrets);
  expect(() => selectReportProjects(normalized)).toThrow(/no enabled report projects found in configuration/u);
});

test('selectAutoBuildProject selects matching enabled auto-build project', () => {
  const doc: ProjectConfigDocumentV1 = {
    schemaVersion: 1,
    defaults: defaultOptions,
    projects: [
      { id: 'report-project', name: 'Report Project', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/report-project/', runType: 'report', enabled: true },
      { id: 'build-disabled', name: 'Build Disabled', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/build-disabled/', runType: 'auto-build', enabled: false },
      { id: 'build-enabled', name: 'Build Enabled', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/build-enabled/', runType: 'auto-build', enabled: true },
    ],
  };
  const normalized = normalizeProjectConfigDocument(doc, mockSecrets);
  const selected = selectAutoBuildProject(normalized, 'build-enabled');
  expect(selected.id).toBe('build-enabled');
  expect(selected.runType).toBe('auto-build');
});

test('selectAutoBuildProject rejects missing, disabled, and non-auto-build projects', () => {
  const doc: ProjectConfigDocumentV1 = {
    schemaVersion: 1,
    defaults: defaultOptions,
    projects: [
      { id: 'report-project', name: 'Report Project', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/report-project/', runType: 'report', enabled: true },
      { id: 'build-disabled', name: 'Build Disabled', loginUrl: 'https://jenkins.example/jenkins/login', jobUrl: 'https://jenkins.example/jenkins/job/build-disabled/', runType: 'auto-build', enabled: false },
    ],
  };
  const normalized = normalizeProjectConfigDocument(doc, mockSecrets);
  expect(() => selectAutoBuildProject(normalized, '')).toThrow(/projectId must be a non-empty string/u);
  expect(() => selectAutoBuildProject(normalized, 'non-existent')).toThrow(/project 'non-existent' was not found in configuration/u);
  expect(() => selectAutoBuildProject(normalized, 'build-disabled')).toThrow(/project 'build-disabled' is disabled/u);
  expect(() => selectAutoBuildProject(normalized, 'report-project')).toThrow(/project 'report-project' is not configured for auto-build/u);
});
