import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from '@playwright/test';

import type {
  ProjectFailureResultV3,
  ProjectRunManifest,
} from '../../src/artifacts/artifact-manifest.js';
import type { VulnerabilityReportResultV3 } from '../../src/result-types.js';
import {
  validateDataAndManifestAgreement,
  type ProjectReportState,
} from '../../src/reporting/control-page/hooks/use-project-report.js';
import { ProjectReportStatusView } from '../../src/reporting/control-page/components/molecules/ProjectReportStatusView.js';

const RUN_ID = '20260824t040000z-0000000000000001';
const OBSERVED_AT = '2026-08-24T04:00:00.000Z';
const JOB_URL = 'https://jenkins.example/job/service-a/';

function sampleData(overrides: Partial<VulnerabilityReportResultV3> = {}): VulnerabilityReportResultV3 {
  return {
    schemaVersion: 3,
    state: 'success',
    project: { id: 'service-a', name: 'Service A' },
    run: { runId: RUN_ID, observedAt: OBSERVED_AT },
    jenkins: { jobUrl: JOB_URL },
    navigation: {
      'jenkins-job': { key: 'jenkins-job', localAnchor: '#jenkins', state: 'found', liveUrl: JOB_URL },
      'snyk-report': { key: 'snyk-report', localAnchor: '#snyk-test-report', state: 'found', liveUrl: 'https://snyk.example/report' },
      'sonarqube-home': { key: 'sonarqube-home', localAnchor: '#sonarqube-home', state: 'found', liveUrl: 'https://sonar.example/' },
      'sonarqube-overall': { key: 'sonarqube-overall', localAnchor: '#sonarqube-overall', state: 'found', liveUrl: 'https://sonar.example/overall' },
      'sonarqube-issues': { key: 'sonarqube-issues', localAnchor: '#sonarqube-issues', state: 'found', liveUrl: 'https://sonar.example/issues' },
    },
    reports: {
      snyk: { state: 'found', captures: [], navigation: [{ key: 'snyk-report', localAnchor: '#snyk-test-report', state: 'found', liveUrl: 'https://snyk.example/report' }], warnings: [], summary: { counts: { critical: 0, high: 0, medium: 0, low: 0 }, detail: { totalObserved: 0, retainedCount: 0, truncated: false, omittedCount: 0 } }, findings: [] },
      sonarqube: { state: 'found', captures: [], navigation: [{ key: 'sonarqube-home', localAnchor: '#sonarqube-home', state: 'found', liveUrl: 'https://sonar.example/' }, { key: 'sonarqube-overall', localAnchor: '#sonarqube-overall', state: 'found', liveUrl: 'https://sonar.example/overall' }, { key: 'sonarqube-issues', localAnchor: '#sonarqube-issues', state: 'found', liveUrl: 'https://sonar.example/issues' }], warnings: [], facets: { types: [], severities: [] } },
    },
    warnings: [],
    ...overrides,
  };
}

function sampleManifest(overrides: Partial<ProjectRunManifest> = {}): ProjectRunManifest {
  return {
    kind: 'project-run',
    schemaVersion: 3,
    project: { id: 'service-a', name: 'Service A' },
    run: { runId: RUN_ID, observedAt: OBSERVED_AT },
    state: 'success',
    jenkins: { jobUrl: JOB_URL },
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
    warnings: [],
    ...overrides,
  };
}

test.describe('use-project-report: validateDataAndManifestAgreement', () => {
  test('returns undefined when all fields match between route, data, and manifest', () => {
    const data = sampleData();
    const manifest = sampleManifest();
    expect(validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest)).toBeUndefined();
  });

  test('flags project ID mismatch against route', () => {
    const data = sampleData({ project: { id: 'service-b', name: 'Service A' } });
    const manifest = sampleManifest({ project: { id: 'service-b', name: 'Service A' } });
    const err = validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest);
    expect(err).toContain("route expects 'service-a'");
  });

  test('flags project ID mismatch between data and manifest', () => {
    const data = sampleData({ project: { id: 'service-a', name: 'Service A' } });
    const manifest = sampleManifest({ project: { id: 'service-b', name: 'Service A' } });
    const err = validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest);
    expect(err).toContain("manifest 'service-b'");
  });

  test('flags run ID mismatch', () => {
    const data = sampleData({ run: { runId: 'different-run', observedAt: OBSERVED_AT } });
    const manifest = sampleManifest();
    const err = validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest);
    expect(err).toContain("Run ID mismatch: route expects");
  });

  test('flags project name mismatch', () => {
    const data = sampleData({ project: { id: 'service-a', name: 'Name A' } });
    const manifest = sampleManifest({ project: { id: 'service-a', name: 'Name B' } });
    const err = validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest);
    expect(err).toContain("Project name mismatch: data 'Name A', manifest 'Name B'");
  });

  test('flags timestamp mismatch', () => {
    const data = sampleData({ run: { runId: RUN_ID, observedAt: '2026-08-24T04:00:00.000Z' } });
    const manifest = sampleManifest({ run: { runId: RUN_ID, observedAt: '2026-08-25T05:00:00.000Z' } });
    const err = validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest);
    expect(err).toContain("Timestamp mismatch");
  });

  test('flags state mismatch', () => {
    const data = sampleData({ state: 'success' });
    const manifest = sampleManifest({ state: 'partial' });
    const err = validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest);
    expect(err).toContain("State mismatch: data 'success', manifest 'partial'");
  });

  test('flags Jenkins job URL mismatch', () => {
    const data = sampleData({ jenkins: { jobUrl: 'https://jenkins.example/job/a/' } });
    const manifest = sampleManifest({ jenkins: { jobUrl: 'https://jenkins.example/job/b/' } });
    const err = validateDataAndManifestAgreement('service-a', RUN_ID, data, manifest);
    expect(err).toContain("Jenkins job URL mismatch");
  });
});

test.describe('ProjectReportStatusView UI states', () => {
  test('renders loading status with role="status"', () => {
    const state: ProjectReportState = { status: 'loading' };
    const html = renderToStaticMarkup(React.createElement(ProjectReportStatusView, { state, onReload: () => {} }));
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading report evidence...');
  });

  test('renders missing alert with role="alert"', () => {
    const state: ProjectReportState = { status: 'missing', message: 'Report evidence not found for service-a/run-1' };
    const html = renderToStaticMarkup(React.createElement(ProjectReportStatusView, { state, onReload: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Report Not Found');
    expect(html).toContain('Report evidence not found for service-a/run-1');
    expect(html).toContain('Return to Report Index');
  });

  test('renders invalid alert with role="alert"', () => {
    const state: ProjectReportState = { status: 'invalid', message: 'Corrupt or unparseable manifest.json' };
    const html = renderToStaticMarkup(React.createElement(ProjectReportStatusView, { state, onReload: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Invalid Report Evidence');
    expect(html).toContain('Corrupt or unparseable manifest.json');
  });

  test('renders load-error alert with retry button and role="alert"', () => {
    const state: ProjectReportState = { status: 'load-error', message: 'Network error loading report: Failed to fetch' };
    const html = renderToStaticMarkup(React.createElement(ProjectReportStatusView, { state, onReload: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Error Loading Report');
    expect(html).toContain('Retry');
  });

  test('renders null for ready status', () => {
    const data = sampleData();
    const manifest = sampleManifest();
    const state: ProjectReportState = {
      status: 'ready',
      model: {
        state: 'success',
        project: data.project,
        run: data.run,
        navigation: [],
        warnings: [],
        artifacts: [],
      },
      manifest,
      rawData: data,
      projectId: 'service-a',
      runId: RUN_ID,
    };
    const html = renderToStaticMarkup(React.createElement(ProjectReportStatusView, { state, onReload: () => {} }));
    expect(html).toBe('');
  });
});
