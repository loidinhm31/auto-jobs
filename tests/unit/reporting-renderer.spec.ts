import { expect, test } from '@playwright/test';

import type { ProjectFailureResultV3, ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { escapeHtmlAttribute, escapeHtmlText } from '../../src/reporting/html-escape.js';
import { renderAggregateReport } from '../../src/reporting/aggregate-report-renderer.js';
import { localArtifactHref, localManifestHref, localReportHref, safeExternalHref } from '../../src/reporting/report-links.js';
import { renderProjectReport } from '../../src/reporting/project-report-renderer.js';
import { createProjectReportViewModel } from '../../src/reporting/report-view-model.js';
import type { AggregateReportResult, VulnerabilityReportResultV3 } from '../../src/result-types.js';

const JOB_URL = 'https://jenkins.example/job/service-a/';
const RUN_ID = '20260824t040000z-0000000000000001';
const OBSERVED_AT = '2026-08-24T04:00:00.000Z';

function result(overrides: Partial<VulnerabilityReportResultV3> = {}): VulnerabilityReportResultV3 {
  const navigation = {
    'jenkins-job': { key: 'jenkins-job' as const, localAnchor: '#jenkins', state: 'found' as const, liveUrl: JOB_URL },
    'snyk-report': { key: 'snyk-report' as const, localAnchor: '#snyk-test-report', state: 'found' as const, liveUrl: 'https://snyk.example/report' },
    'sonarqube-home': { key: 'sonarqube-home' as const, localAnchor: '#sonarqube-home', state: 'found' as const, liveUrl: 'https://sonar.example/dashboard?id=service-a' },
    'sonarqube-overall': { key: 'sonarqube-overall' as const, localAnchor: '#sonarqube-overall', state: 'found' as const, liveUrl: 'https://sonar.example/dashboard?id=service-a&codeScope=overall' },
    'sonarqube-issues': { key: 'sonarqube-issues' as const, localAnchor: '#sonarqube-issues', state: 'found' as const, liveUrl: 'https://sonar.example/project/issues?id=service-a' },
  };
  return {
    schemaVersion: 3, state: 'success', project: { id: 'service-a', name: 'Service <A>' },
    run: { runId: RUN_ID, observedAt: OBSERVED_AT }, jenkins: { jobUrl: JOB_URL }, navigation,
    reports: {
      snyk: { state: 'found', captures: [{ url: 'https://snyk.example/report', capturedAt: OBSERVED_AT, screenshotPath: 'snyk-test-report.png', title: 'Snyk report' }], navigation: [navigation['snyk-report']], warnings: [], summary: { counts: { critical: 1, high: 2, medium: 0, low: 0 }, detail: { totalObserved: 2, retainedCount: 2, truncated: false, omittedCount: 0 } }, findings: [{ id: 'SNYK-1', title: 'Unsafe <dependency>', severity: 'high', module: 'pkg' }, { id: 'SNYK-0', title: 'Critical item', severity: 'critical' }] },
      sonarqube: { state: 'found', captures: [{ url: 'https://sonar.example/dashboard?id=service-a', capturedAt: OBSERVED_AT }, { url: 'https://sonar.example/dashboard?id=service-a&codeScope=overall', capturedAt: OBSERVED_AT, screenshotPath: 'sonarqube-overall.png' }, { url: 'https://sonar.example/project/issues?id=service-a', capturedAt: OBSERVED_AT, screenshotPath: 'sonarqube-issues.png' }], navigation: [navigation['sonarqube-home'], navigation['sonarqube-overall'], navigation['sonarqube-issues']], warnings: [], facets: { types: [{ label: 'Bug', count: 2 }], severities: [{ label: 'High', count: 1 }] } },
    }, warnings: [], ...overrides,
  };
}

function manifest(state: ProjectRunManifest['state'] = 'success', withJob = true): ProjectRunManifest {
  return {
    kind: 'project-run', schemaVersion: 3, project: { id: 'service-a', name: 'Service <A>' }, run: { runId: RUN_ID, observedAt: OBSERVED_AT }, state,
    ...(withJob ? { jenkins: { jobUrl: JOB_URL } } : {}),
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: ['sonarqube-issues.png', 'snyk-test-report.png', 'sonarqube-overall.png'] }, warnings: [],
  };
}

test('escapes text and rejects unsafe report links', () => {
  expect(escapeHtmlText('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  expect(escapeHtmlAttribute('a" onerror="bad')).toBe('a&quot; onerror&#61;&quot;bad');
  expect(localArtifactHref('../secret.png', ['../secret.png'])).toBeUndefined();
  expect(localReportHref('../outside/index.html')).toBeUndefined();
  expect(localManifestHref('/tmp/manifest.json')).toBeUndefined();
  expect(safeExternalHref('javascript:alert(1)')).toBeUndefined();
  expect(safeExternalHref('https://user:password@example.com/report')).toBeUndefined();
});

test('renders inert direct evidence with stable anchors and state-aware images', () => {
  const html = renderProjectReport(createProjectReportViewModel(result({ project: { id: 'service-a', name: '<img src=x onerror=alert(1)>' } }), manifest()));
  expect(html).toContain('id="snyk-test-report"');
  expect(html).toContain('id="sonarqube-overall"');
  expect(html).toContain('id="sonarqube-issues"');
  expect(html).toContain('Content-Security-Policy');
  expect(html).toContain('snyk-test-report.png');
  expect(html).not.toMatch(/<script/iu);
  expect(html).not.toMatch(/onerror\s*=/iu);
  expect(createProjectReportViewModel(result(), manifest()).snyk?.findings?.map((finding) => finding.id)).toEqual(['SNYK-0', 'SNYK-1']);
  const partial = renderProjectReport(createProjectReportViewModel(result({ state: 'partial' }), { ...manifest('partial'), artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] }, warnings: ['Snyk screenshot unavailable'] }));
  expect(partial).toContain('Partial');
  expect(partial).not.toContain('<img src="sonarqube-overall.png"');
  expect(partial).toContain('Snyk screenshot unavailable');
});

test('renders aggregate projects in order without build fields or unsafe links', () => {
  const aggregate: AggregateReportResult = {
    schemaVersion: 3, generatedAt: OBSERVED_AT, warnings: ['ignored invalid manifest'], projects: [
      { projectId: 'service-z', name: 'Zed', state: 'partial', reportPath: 'service-z/run-z/index.html', runs: [{ runId: 'run-z', state: 'partial', manifestPath: 'service-z/run-z/manifest.json', reportPath: 'service-z/run-z/index.html', warnings: [] }], warnings: [] },
      { projectId: 'service-a', name: 'Alpha', state: 'failed', reportPath: '../escape/index.html', runs: [{ runId: 'run-a', state: 'failed', manifestPath: 'service-a/run-a/manifest.json', warnings: ['failed before report'] }], warnings: ['failed before report'] },
    ],
  };
  const html = renderAggregateReport(aggregate);
  expect(html.indexOf('Zed')).toBeLessThan(html.indexOf('Alpha'));
  expect(html).toContain('service-z/run-z/index.html');
  expect(html).toContain('service-a/run-a/manifest.json');
  expect(html).not.toContain('escape/index.html');
  expect(html).not.toContain('buildNumber');
  expect(html).not.toMatch(/<script/iu);
});

test('keeps the SonarQube Issues anchor in a direct failed report', () => {
  const failure: ProjectFailureResultV3 = { schemaVersion: 3, project: { id: 'service-a', name: 'Service A' }, run: { runId: RUN_ID, observedAt: OBSERVED_AT }, state: 'failed', diagnostic: 'Jenkins login failed', warnings: [] };
  const html = renderProjectReport(createProjectReportViewModel(failure, manifest('failed', false)));
  expect(html).toContain('id="sonarqube-issues"');
  expect(html).toContain('No SonarQube Issues evidence was captured.');
});
