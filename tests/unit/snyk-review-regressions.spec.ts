import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { safeSnykSource } from '../../src/artifacts/snyk-result-sanitizer.js';
import { sanitizeCaptureResult, type CaptureResult } from '../../src/project/project-capture.js';
import { extractSnykHtml } from '../../src/reports/snyk/snyk-html-extractor.js';
import { normalizeSnykEvidence } from '../../src/reports/snyk/snyk-normalize.js';
import { parseSnykSummaryJson } from '../../src/reports/snyk/snyk-summary-parser.js';
import type { NavigationTargets, SourceEvidence } from '../../src/result-types.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';
import { captureSnykEvidence } from '../../src/reports/snyk/snyk-capture.js';
import { snykProjectIdentityWarning } from '../../src/reports/snyk/snyk-capture-support.js';

function project(overrides: Record<string, unknown> = {}): NormalizedProjectConfig {
  return {
    id: 'service-a', name: 'Service A', enabled: true, schemaVersion: 1,
    loginUrl: 'https://jenkins.example/jenkins/login',
    jobUrl: 'https://jenkins.example/jenkins/job/service-a/',
    browser: 'chromium', artifactDir: 'reports',
    credentialVariables: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: ['https://jenkins.example'], sonarqube: [] },
    sources: { snyk: { allowedOrigins: ['https://jenkins.example'] }, sonarqube: { allowedOrigins: [] } },
    selectors: { snykReport: { kind: 'testId', value: 'snyk-report', required: false } },
    ...overrides,
  } as unknown as NormalizedProjectConfig;
}

test('extracts fallback severity classes only from visible cards', async ({ page }) => {
  await page.setContent(`
    <h1>Snyk test report</h1>
    <article class="card--vuln severity--critical"><h2 class="card__title">Critical</h2></article>
    <article class="card--vuln critical severity"><h2 class="card__title">Also critical</h2></article>
    <article class="card--vuln severity--unknown"><h2 class="card__title">Unknown</h2></article>
    <article class="card--vuln severity-high" style="display:none"><h2 class="card__title">Hidden high</h2></article>
  `);
  const evidence = await extractSnykHtml(page);
  expect(evidence.findings.map((finding) => finding.severity)).toEqual(['critical', 'critical']);
  expect(evidence.severityCounts).toEqual({ critical: 2, high: 0, medium: 0, low: 0 });
  expect(evidence.warnings).toContain('Snyk detail cards contained unrecognized severity labels');
});

test('extracts semantic counts and findings only from visible nodes', async ({ page }) => {
  await page.setContent(`
    <div class="meta-row" style="display:none"><span class="meta-row-label">Project</span><span class="meta-row-value">hidden-project</span></div>
    <div class="severity-count critical" style="display:none">9</div>
    <main data-testid="snyk-report">
      <table><tbody>
        <tr><th scope="row">High</th><td>1</td></tr>
        <tr style="display:none"><th scope="row">Critical</th><td>9</td></tr>
      </tbody></table>
      <ul data-testid="snyk-findings">
        <li>Visible high finding</li>
        <li style="display:none">Hidden critical finding</li>
      </ul>
    </main>
  `);
  const evidence = await extractSnykHtml(page);
  expect(evidence.severityCounts).toEqual({ critical: 0, high: 1, medium: 0, low: 0 });
  expect(evidence.findings).toEqual([{ title: 'Visible high finding', severity: 'high' }]);
  expect(evidence.metadata).not.toHaveProperty('project');
});

test('retains zero-valued visible severity totals without detail cards', async ({ page }) => {
  await page.setContent(`
    <div class="severity-count critical">0</div><div class="severity-count high">0</div>
    <div class="severity-count medium">0</div><div class="severity-count low">0</div>
  `);
  const evidence = await extractSnykHtml(page);
  expect(evidence.hasDetailCards).toBe(false);
  expect(evidence.severityCounts).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
});

test('reconciles summary and details per severity', () => {
  const normalized = normalizeSnykEvidence({
    html: {
      metadata: {}, hasDetailCards: true,
      findings: [
        { id: 'CVE-1', severity: 'critical' },
        { id: 'CVE-2', severity: 'high' },
      ],
    },
    summary: { counts: { critical: 2, high: 0, medium: 0, low: 0 }, warnings: [] },
  });
  expect(normalized.state).toBe('incomplete');
  expect(normalized.warnings.some((warning) => warning.includes('critical') && warning.includes('high'))).toBe(true);
});

test('validates Snyk project identity when the source config declares one', () => {
  const configured = project({ sources: { snyk: { projectId: 'service-a' }, sonarqube: { allowedOrigins: [] } } });
  expect(snykProjectIdentityWarning({ project: 'service-b' }, configured, 'https://jenkins.example/jenkins/artifact/snyk-results.html')).toContain('did not match');
  expect(snykProjectIdentityWarning({ project: 'service-a' }, configured, 'https://jenkins.example/jenkins/artifact/snyk-results.html')).toBeUndefined();
});

test('requires explicit identity for external Snyk evidence', () => {
  const external = project({
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: ['https://snyk.example'], sonarqube: [] },
    sources: { snyk: { allowedOrigins: ['https://snyk.example'] }, sonarqube: { allowedOrigins: [] } },
  });
  expect(snykProjectIdentityWarning({ project: 'service-a' }, external, 'https://snyk.example/report.html')).toContain('not configured');
  const configured = project({
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: ['https://snyk.example'], sonarqube: [] },
    sources: { snyk: { allowedOrigins: ['https://snyk.example'], projectId: 'service-a' }, sonarqube: { allowedOrigins: [] } },
  });
  expect(snykProjectIdentityWarning({ project: 'service-a' }, configured, 'https://snyk.example/report.html')).toBeUndefined();
});

test('normalizes duplicate findings deterministically regardless of input order', () => {
  const first = { id: 'V-1', severity: 'high' as const, description: 'detail', paths: ['z', 'a'], references: ['https://snyk.example/b', 'https://snyk.example/a'] };
  const second = { id: 'V-1', severity: 'low' as const, title: 'title' };
  const forward = normalizeSnykEvidence({ html: { metadata: {}, hasDetailCards: true, findings: [first, second] } });
  const reverse = normalizeSnykEvidence({ html: { metadata: {}, hasDetailCards: true, findings: [second, first] } });
  expect(forward.findings).toEqual(reverse.findings);
  expect(forward.findings[0]).toMatchObject({ severity: 'high', title: 'title', description: 'detail', paths: ['a', 'z'] });
  expect(forward.findings[0]?.references).toEqual(['https://snyk.example/a', 'https://snyk.example/b']);
});

test('bounds summary parsing before accepting oversized JSON', () => {
  expect(parseSnykSummaryJson('x'.repeat(1_048_577)).warnings[0]).toMatch(/exceeds/u);
});

test('drops credential-like reference query values in both normalization and artifact sanitization', () => {
  const normalized = normalizeSnykEvidence({
    html: {
      metadata: {}, hasDetailCards: true,
      findings: [{ severity: 'high', references: ['https://snyk.example/vuln?token=secret', 'https://snyk.example/vuln?tab=details'] }],
    },
  });
  expect(normalized.findings[0]?.references).toEqual(['https://snyk.example/vuln?tab=details']);
  const source = safeSnykSource({
    state: 'found', captures: [], navigation: [], warnings: [],
    findings: [{ severity: 'high', references: ['https://snyk.example/vuln?password=secret', 'https://snyk.example/vuln?tab=details'] }],
  }, (value) => value);
  expect(source.findings?.[0]?.references).toEqual(['https://snyk.example/vuln?tab=details']);
});

test('preserves safe screenshot artifact references while sanitizing capture output', () => {
  const navigation = {
    'jenkins-job': { key: 'jenkins-job', localAnchor: '#jenkins', state: 'found' },
    'snyk-report': { key: 'snyk-report', localAnchor: '#snyk-test-report', state: 'found' },
    'sonarqube-home': { key: 'sonarqube-home', localAnchor: '#sonarqube-overall', state: 'incomplete' },
    'sonarqube-overall': { key: 'sonarqube-overall', localAnchor: '#sonarqube-overall', state: 'incomplete' },
    'sonarqube-issues': { key: 'sonarqube-issues', localAnchor: '#sonarqube-issues', state: 'incomplete' },
  } as NavigationTargets;
  const source: SourceEvidence = { state: 'found', captures: [], navigation: [], warnings: [] };
  const capture: CaptureResult = {
    navigation, reports: { snyk: { ...source, findings: [] }, sonarqube: source }, warnings: [],
    artifacts: { screenshots: ['snyk-test-report.png', '../escape.png'] },
  };
  const sanitized = sanitizeCaptureResult(capture, { username: 'user', password: 'pass' });
  expect(sanitized.artifacts).toEqual({ screenshots: ['snyk-test-report.png'] });
});

test('disables inline scripts before navigating to the report', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-safe-capture-'));
  try {
    await page.route('https://jenkins.example/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/job/service-a/')) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<a href="/jenkins/artifact/snyk-results.html">Snyk test report</a>' });
      } else if (url.pathname.endsWith('/artifact/snyk-results.html')) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Snyk test report</h1><script>document.body.dataset.inlineRan = "yes"</script>' });
      } else {
        await route.fulfill({ status: 404, body: 'not found' });
      }
    });
    await page.goto('https://jenkins.example/jenkins/job/service-a/');
    await captureSnykEvidence({ page, project: project(), deadline: new WorkflowDeadline(30_000), outputDirectory });
    expect(await page.locator('body').getAttribute('data-inline-ran')).toBeNull();
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('blocks an unallowlisted report redirect before the fixture receives it', async ({ page }) => {
  let evilSeen = false;
  await page.route('https://jenkins.example/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/job/service-a/')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<a href="/jenkins/artifact/snyk-redirect.html">Snyk test report</a>' });
    } else if (url.pathname.endsWith('/artifact/snyk-redirect.html')) {
      await route.fulfill({ status: 302, headers: { location: 'https://evil.example/report.html?sessionid=secret-value' } });
    } else {
      evilSeen = true;
      await route.fulfill({ status: 200, body: '<h1>evil</h1>' });
    }
  });
  await page.goto('https://jenkins.example/jenkins/job/service-a/');
  const result = await captureSnykEvidence({
    page, project: project(), deadline: new WorkflowDeadline(30_000), outputDirectory: os.tmpdir(),
  });
  expect(evilSeen).toBe(false);
  expect(result.source.state).toBe('incomplete');
  expect(result.warnings.join(' ')).not.toMatch(/sessionid|evil\.example/iu);
});
