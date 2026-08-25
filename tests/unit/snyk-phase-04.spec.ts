import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { classifySnykLinks } from '../../src/reports/source-link-classifier.js';
import { captureSnykEvidence } from '../../src/reports/snyk/snyk-capture.js';
import { extractSnykHtml, type SnykHtmlEvidence } from '../../src/reports/snyk/snyk-html-extractor.js';
import { normalizeSnykEvidence } from '../../src/reports/snyk/snyk-normalize.js';
import { parseSnykSummaryJson } from '../../src/reports/snyk/snyk-summary-parser.js';
import type { SnykFinding } from '../../src/result-types.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

const templatePath = path.resolve('templates/snyk-template/template.html');
const summaryPath = path.resolve('templates/snyk-template/snyk-sca-results-summary.json');

function project(overrides: Record<string, unknown> = {}): NormalizedProjectConfig {
  return {
    id: 'service-a', name: 'Service A', enabled: true, schemaVersion: 1,
    baseUrl: 'https://jenkins.example/jenkins', jobPath: 'service-a', jobUrl: 'https://jenkins.example/jenkins/job/service-a/',
    loginPath: '/login', triggerMode: 'ui', timeoutMs: 30_000, pollIntervalMs: 50,
    browser: 'chromium', artifactDir: 'reports',
    credentialVariables: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: ['https://jenkins.example'], sonarqube: [] },
    sources: { snyk: { allowedOrigins: ['https://jenkins.example'] }, sonarqube: { allowedOrigins: [] } },
    selectors: { snykReport: { kind: 'testId', value: 'snyk-report', required: false } },
    ...overrides,
  } as unknown as NormalizedProjectConfig;
}

function htmlEvidence(findings: SnykFinding[], counts?: SnykHtmlEvidence['severityCounts']): SnykHtmlEvidence {
  return { metadata: {}, findings, hasDetailCards: true, ...(counts === undefined ? {} : { severityCounts: counts }) };
}

test('parses the saved summary without retaining vendor identifiers', () => {
  const parsed = parseSnykSummaryJson(fs.readFileSync(summaryPath, 'utf8'));
  expect(parsed.warnings).toEqual([]);
  expect(parsed.counts).toEqual({ critical: 3, high: 17, medium: 0, low: 0 });
});

test('extracts the saved Snyk title, metadata, severity cards, and references', async ({ page }) => {
  await page.setContent(fs.readFileSync(templatePath, 'utf8'));
  const evidence = await extractSnykHtml(page);
  expect(evidence.title).toBe('Snyk test report');
  expect(evidence.hasDetailCards).toBe(true);
  expect(evidence.selectorStrategy).toBe('data-snyk-test');
  expect(evidence.findings.length).toBeGreaterThan(0);
  expect(evidence.findings[0]?.severity).toBe('critical');
  expect(evidence.findings[0]?.references?.[0]).toMatch(/^https:\/\//u);
  expect(evidence.metadata.packageManager).toBe('maven');
  expect(evidence.metadata.project).toBeDefined();
});

test('normalizes summary/detail mismatch while omitting project identifiers', async ({ page }) => {
  await page.setContent(fs.readFileSync(templatePath, 'utf8'));
  const html = await extractSnykHtml(page);
  const summary = parseSnykSummaryJson(fs.readFileSync(summaryPath, 'utf8'));
  const normalized = normalizeSnykEvidence({ html, summary });
  expect(normalized.state).toBe('incomplete');
  expect(normalized.summary.counts).toEqual({ critical: 3, high: 17, medium: 0, low: 0 });
  expect(normalized.summary.metadata).not.toHaveProperty('project');
  expect(normalized.findings.length).toBeGreaterThan(0);
  expect(normalized.warnings.some((warning) => warning.includes('mismatch'))).toBe(true);
});

test('accepts summary-only evidence without inventing detailed findings', () => {
  const summary = parseSnykSummaryJson(JSON.stringify({ severity_counts: { critical: 3, high: 17, medium: 0, low: 0 } }));
  const normalized = normalizeSnykEvidence({ html: { metadata: {}, findings: [], hasDetailCards: false }, summary });
  expect(normalized.state).toBe('found');
  expect(normalized.findings).toEqual([]);
  expect(normalized.summary.detail).toEqual({ totalObserved: 0, retainedCount: 0, truncated: false, omittedCount: 0 });
});

test('deduplicates and retains the exact 500-detail boundary', () => {
  for (const observed of [500, 501]) {
    const findings = Array.from({ length: observed }, (_, index) => ({
      id: `SNYK-${String(index).padStart(4, '0')}`,
      title: `Finding ${index}`,
      severity: 'low' as const,
      paths: [`module-${index}`],
      references: [`https://snyk.example/vuln/SNYK-${index}`],
    }));
    const normalized = normalizeSnykEvidence({
      html: htmlEvidence(findings, { critical: 0, high: 0, medium: 0, low: observed }),
    });
    expect(normalized.state).toBe('found');
    expect(normalized.summary.counts.low).toBe(observed);
    expect(normalized.findings).toHaveLength(Math.min(observed, 500));
    expect(normalized.summary.detail).toEqual({
      totalObserved: observed,
      retainedCount: Math.min(observed, 500),
      truncated: observed === 501,
      omittedCount: observed === 501 ? 1 : 0,
    });
    expect(normalized.findings[0]?.id).toBe('SNYK-0000');
    expect(normalized.findings[499]?.id).toBe('SNYK-0499');
  }
});

test('classifies only Snyk-shaped allowed links and rejects ambiguity', () => {
  const safeProject = project();
  const classified = classifySnykLinks([
    { href: 'https://jenkins.example/jenkins/artifact/reports.html', text: 'Artifact report' },
    { href: 'https://jenkins.example/jenkins/artifact/snyk-results.html/*fingerprint*/', text: 'Snyk test report' },
    { href: 'https://jenkins.example/jenkins/artifact/snyk-results.html/*view*/', text: 'Snyk test report' },
    { href: 'https://jenkins.example/jenkins/artifact/snyk-sbom.json', text: 'Snyk SBOM' },
    { href: 'https://jenkins.example/jenkins/artifact/snyk-sca-results-summary.json/*view*/', text: 'Snyk summary' },
    { href: 'https://evil.example/snyk-results.html', text: 'Snyk report' },
  ], safeProject);
  expect(classified.report?.href).toBe('https://jenkins.example/jenkins/artifact/snyk-results.html');
  expect(classified.summary?.href).toBe('https://jenkins.example/jenkins/artifact/snyk-sca-results-summary.json');
  expect(classified.warnings).toContain('an observed Snyk link was outside the configured origins');

  const ambiguous = classifySnykLinks([
    { href: 'https://jenkins.example/jenkins/artifact/snyk-results.html?project=a', text: 'Snyk report A' },
    { href: 'https://jenkins.example/jenkins/artifact/snyk-results.html?project=b', text: 'Snyk report B' },
  ], safeProject);
  expect(ambiguous.report).toBeUndefined();
  expect(ambiguous.warnings).toContain('ambiguous Snyk report candidates were rejected');
});

test('captures a validated report section with fixed viewport and hashed screenshot', async ({ page }) => {
  const reportHtml = fs.readFileSync(templatePath, 'utf8');
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-capture-'));
  try {
    await page.route('https://jenkins.example/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/job/service-a/')) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<a href="/jenkins/artifact/snyk-results.html">Snyk test report</a>' });
      } else if (url.pathname.endsWith('/artifact/snyk-results.html')) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: reportHtml });
      } else {
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      }
    });
    await page.goto('https://jenkins.example/jenkins/job/service-a/');
    const result = await captureSnykEvidence({
      page,
      project: project(),
      deadline: new WorkflowDeadline(30_000),
      outputDirectory,
      terminalBuildUrl: 'https://jenkins.example/jenkins/job/service-a/',
    });
    expect(result.source.state).toBe('found');
    expect(result.source.captures[0]?.screenshotPath).toBe('snyk-test-report.png');
    expect(result.source.captures[0]?.screenshotSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(fs.existsSync(path.join(outputDirectory, 'snyk-test-report.png'))).toBe(true);
    expect(page.url()).toBe('https://jenkins.example/jenkins/job/service-a/');
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});
