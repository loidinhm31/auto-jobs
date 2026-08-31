import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';
import type { AddressInfo } from 'node:net';

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

function htmlEvidence(findings: SnykFinding[], counts?: SnykHtmlEvidence['severityCounts']): SnykHtmlEvidence {
  return { metadata: {}, findings, hasDetailCards: true, ...(counts === undefined ? {} : { severityCounts: counts }) };
}

test('parses the saved summary without retaining vendor identifiers', () => {
  const parsed = parseSnykSummaryJson(fs.readFileSync(summaryPath, 'utf8'));
  expect(parsed.warnings).toEqual([]);
  expect(parsed.counts).toEqual({ critical: 2, high: 4, medium: 0, low: 0 });
});

test('extracts the saved Snyk title, metadata, severity cards, and references', async ({ page }) => {
  await page.setContent(fs.readFileSync(templatePath, 'utf8'));
  const evidence = await extractSnykHtml(page);
  expect(evidence.title).toBe('Snyk test report');
  expect(evidence.hasDetailCards).toBe(true);
  expect(evidence.selectorStrategy).toBe('data-snyk-test');
  expect(evidence.findings.length).toBeGreaterThan(0);
  expect(evidence.findings[0]?.severity).toBe('critical');
  expect(evidence.severityCounts).toEqual({ critical: 2, high: 4, medium: 0, low: 0 });
  expect(evidence.findings[0]?.references?.[0]).toMatch(/^https:\/\//u);
  expect(evidence.metadata.packageManager).toBe('maven');
  expect(evidence.metadata.project).toBe('com.example-domain.example-package:com.example-domain.example-package.service');
  expect(evidence.metadata.dependencyCount).toBe(160);
  expect(evidence.metadata.dependencyPathCount).toBe(6);
});

test('normalizes consistent summary/detail evidence while omitting project identifiers', async ({ page }) => {
  await page.setContent(fs.readFileSync(templatePath, 'utf8'));
  const html = await extractSnykHtml(page);
  const summary = parseSnykSummaryJson(fs.readFileSync(summaryPath, 'utf8'));
  const normalized = normalizeSnykEvidence({ html, summary });
  expect(normalized.state).toBe('found');
  expect(normalized.summary.counts).toEqual({ critical: 2, high: 4, medium: 0, low: 0 });
  expect(normalized.summary.metadata).not.toHaveProperty('project');
  expect(normalized.findings.length).toBeGreaterThan(0);
  expect(normalized.warnings.some((warning) => warning.includes('mismatch'))).toBe(false);
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
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const body = url.pathname.endsWith('/job/service-a/')
      ? '<a href="/jenkins/artifact/snyk-results.html">Snyk test report</a>'
      : url.pathname.endsWith('/artifact/snyk-results.html') ? reportHtml
        : url.pathname.endsWith('/artifact/snyk-sca-results-summary.json') ? fs.readFileSync(summaryPath, 'utf8')
          : undefined;
    if (body === undefined) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(body) }).end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const configured = project({
    loginUrl: `${origin}/jenkins/login`,
    jobUrl: `${origin}/jenkins/job/service-a/`,
    sourceOrigins: { jenkins: origin, snyk: [origin], sonarqube: [] },
    sources: { snyk: { allowedOrigins: [origin] }, sonarqube: { allowedOrigins: [] } },
  });
  try {
    await page.goto(`${origin}/jenkins/job/service-a/`);
    const result = await captureSnykEvidence({
      page,
      project: configured,
      deadline: new WorkflowDeadline(30_000),
      outputDirectory,
      reportUrl: `${origin}/jenkins/artifact/snyk-results.html`,
      summaryUrl: `${origin}/jenkins/artifact/snyk-sca-results-summary.json`,
    });
    expect(result.source.state).toBe('found');
    expect(result.source.captures[0]?.screenshotPath).toBe('snyk-test-report.png');
    expect(result.source.captures[0]?.screenshotSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(fs.existsSync(path.join(outputDirectory, 'snyk-test-report.png'))).toBe(true);
    expect(page.url()).toBe(`${origin}/jenkins/job/service-a/`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

