import { expect, test } from '@playwright/test';

import type { ProjectFailureResultV2, ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { escapeHtmlAttribute, escapeHtmlText } from '../../src/reporting/html-escape.js';
import { renderAggregateReport } from '../../src/reporting/aggregate-report-renderer.js';
import { localArtifactHref, localManifestHref, localReportHref, safeExternalHref } from '../../src/reporting/report-links.js';
import { renderProjectReport } from '../../src/reporting/project-report-renderer.js';
import { createProjectReportViewModel } from '../../src/reporting/report-view-model.js';
import type { AggregateReportResult, VulnerabilityReportResultV2 } from '../../src/result-types.js';

const buildUrl = 'https://jenkins.example/job/service-a/42/';

function result(overrides: Partial<VulnerabilityReportResultV2> = {}): VulnerabilityReportResultV2 {
  const navigation = {
    'jenkins-build': { key: 'jenkins-build' as const, localAnchor: '#old', state: 'found' as const, liveUrl: buildUrl },
    'snyk-report': { key: 'snyk-report' as const, localAnchor: '#old-snyk', state: 'found' as const, liveUrl: 'https://snyk.example/report' },
    'sonarqube-home': { key: 'sonarqube-home' as const, localAnchor: '#old-home', state: 'found' as const, liveUrl: 'https://sonar.example/dashboard?id=service-a' },
    'sonarqube-overall': { key: 'sonarqube-overall' as const, localAnchor: '#old-overall', state: 'found' as const, liveUrl: 'https://sonar.example/dashboard?id=service-a&codeScope=overall' },
    'sonarqube-issues': { key: 'sonarqube-issues' as const, localAnchor: '#old-issues', state: 'found' as const, liveUrl: 'https://sonar.example/project/issues?id=service-a' },
  };
  return {
    schemaVersion: 2, state: 'success', project: { id: 'service-a', name: 'Service <A>' },
    run: { runId: '20260824t040000z-0000000000000001', observedAt: '2026-08-24T04:00:00.000Z' },
    jenkins: {
      baseUrl: 'https://jenkins.example', jobPath: 'folder/service-a', jobUrl: 'https://jenkins.example/job/folder/job/service-a/',
      buildNumber: 42, buildUrl, status: 'SUCCESS',
      trigger: { capability: 'existing_build', triggerAttempts: 0, warnings: [] },
    },
    navigation,
    reports: {
      snyk: {
        state: 'found', captures: [{ url: 'https://snyk.example/report', capturedAt: '2026-08-24T04:01:00.000Z', screenshotPath: 'snyk-test-report.png', title: 'Snyk report' }],
        navigation: [navigation['snyk-report']], warnings: [],
        summary: { counts: { critical: 1, high: 2, medium: 0, low: 0 }, detail: { totalObserved: 2, retainedCount: 2, truncated: false, omittedCount: 0 } },
        findings: [{ id: 'SNYK-1', title: 'Unsafe <dependency>', severity: 'high', module: 'pkg', remediation: 'Upgrade', paths: ['pkg@1'], references: ['https://snyk.example/advisory/SNYK-1'] }, { id: 'SNYK-0', title: 'Critical item', severity: 'critical' }],
      },
      sonarqube: {
        state: 'found', captures: [
          { url: 'https://sonar.example/dashboard?id=service-a', capturedAt: '2026-08-24T04:02:00.000Z' },
          { url: 'https://sonar.example/dashboard?id=service-a&codeScope=overall', capturedAt: '2026-08-24T04:03:00.000Z', screenshotPath: 'sonarqube-overall.png' },
          { url: 'https://sonar.example/project/issues?id=service-a', capturedAt: '2026-08-24T04:04:00.000Z', screenshotPath: 'sonarqube-issues.png' },
        ], navigation: [navigation['sonarqube-home'], navigation['sonarqube-overall'], navigation['sonarqube-issues']], warnings: [],
        facets: { types: [{ label: 'Bug', count: 2 }, { label: 'Vulnerability', count: 1 }], severities: [{ label: 'High', count: 1 }] },
      },
    }, warnings: [], ...overrides,
  };
}

function manifest(state: ProjectRunManifest['state'] = 'success'): ProjectRunManifest {
  return {
    kind: 'project-run', schemaVersion: 2, project: { id: 'service-a', name: 'Service <A>' },
    run: { runId: '20260824t040000z-0000000000000001', observedAt: '2026-08-24T04:00:00.000Z' }, state,
    jenkins: { buildNumber: 42, buildUrl },
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

test('renders deterministic, inert project evidence with stable anchors and state-aware images', () => {
  const view = createProjectReportViewModel(result({ project: { id: 'service-a', name: '<img src=x onerror=alert(1)>' } }), manifest());
  const html = renderProjectReport(view);
  expect(html).toContain('id="snyk-test-report"');
  expect(html).toContain('id="sonarqube-overall"');
  expect(html).toContain('id="sonarqube-issues"');
  expect(html).toContain('Content-Security-Policy');
  expect(html).toContain('frame-ancestors');
  expect(html).toContain('snyk-test-report.png');
  expect(html).not.toMatch(/<script/iu);
  expect(html).not.toMatch(/onerror\s*=/iu);
  expect(html).not.toContain('javascript:');
  expect(view.snyk?.findings?.map((finding) => finding.id)).toEqual(['SNYK-0', 'SNYK-1']);

  const partial = renderProjectReport(createProjectReportViewModel(result({ state: 'partial' }), { ...manifest('partial'), artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] }, warnings: ['Snyk screenshot unavailable'] }));
  expect(partial).toContain('Partial');
  expect(partial).not.toContain('<img src="sonarqube-overall.png"');
  expect(partial).toContain('Snyk screenshot unavailable');
});

test('renders aggregate projects in configured order and omits unsafe or missing report links', () => {
  const aggregate: AggregateReportResult = {
    schemaVersion: 2, generatedAt: '2026-08-24T04:05:00.000Z', warnings: ['ignored invalid manifest'], projects: [
      { projectId: 'service-z', name: 'Zed', state: 'partial', reportPath: 'service-z/42/run-z/index.html', runs: [{ buildNumber: 42, runId: 'run-z', state: 'partial', manifestPath: 'service-z/42/run-z/manifest.json', reportPath: 'service-z/42/run-z/index.html', warnings: [] }], warnings: [] },
      { projectId: 'service-a', name: 'Alpha', state: 'failed', reportPath: '../escape/index.html', runs: [{ buildNumber: 41, runId: 'run-a', state: 'failed', manifestPath: 'service-a/41/run-a/manifest.json', warnings: ['failed before report'] }], warnings: ['failed before report'] },
    ],
  };
  const html = renderAggregateReport(aggregate);
  expect(html.indexOf('Zed')).toBeLessThan(html.indexOf('Alpha'));
  expect(html).toContain('service-z/42/run-z/index.html');
  expect(html).toContain('service-a/41/run-a/manifest.json');
  expect(html).not.toContain('escape/index.html');
  expect(html).toContain('ignored invalid manifest');
  expect(html).not.toMatch(/<script/iu);
});

test('keeps the SonarQube Issues anchor in a failed project report', () => {
  const failure: ProjectFailureResultV2 = {
    schemaVersion: 2,
    project: { id: 'service-a', name: 'Service A' },
    run: { runId: '20260824t040000z-0000000000000001', observedAt: '2026-08-24T04:00:00.000Z' },
    state: 'failed',
    diagnostic: 'Jenkins login failed',
    warnings: [],
  };
  const html = renderProjectReport(createProjectReportViewModel(failure, manifest('failed')));
  expect(html).toContain('id="sonarqube-issues"');
  expect(html).toContain('No SonarQube Issues evidence was captured.');
});
