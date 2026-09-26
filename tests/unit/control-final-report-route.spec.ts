import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { createReportServer } from '../../src/reporting/report-server.js';
import { AGGREGATE_REPORT_MARKER, REPORT_CSP } from '../../src/reporting/report-server-constants.js';

function createValidRunFiles(reportRoot: string, projectId: string, runId: string): void {
  const dir = path.join(reportRoot, projectId, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      kind: 'project-run',
      schemaVersion: 3,
      project: { id: projectId, name: `Project ${projectId}` },
      run: { runId, observedAt: '2026-09-24T10:00:00.000Z' },
      state: 'success',
      artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
      warnings: [],
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'data.json'),
    JSON.stringify({
      schemaVersion: 3,
      project: { id: projectId, name: `Project ${projectId}` },
      run: { runId, observedAt: '2026-09-24T10:00:00.000Z' },
      state: 'success',
      jenkins: { jobUrl: 'https://jenkins.example/job/service-a/' },
      navigation: {
        'jenkins-job': { key: 'jenkins-job', localAnchor: '#jenkins', state: 'found', liveUrl: 'https://jenkins.example/job/service-a/' },
        'snyk-report': { key: 'snyk-report', localAnchor: '#snyk-test-report', state: 'found', liveUrl: 'https://snyk.example/' },
        'sonarqube-home': { key: 'sonarqube-home', localAnchor: '#sonarqube-home', state: 'found', liveUrl: 'https://sonar.example/' },
        'sonarqube-overall': { key: 'sonarqube-overall', localAnchor: '#sonarqube-overall', state: 'found', liveUrl: 'https://sonar.example/overall' },
        'sonarqube-issues': { key: 'sonarqube-issues', localAnchor: '#sonarqube-issues', state: 'found', liveUrl: 'https://sonar.example/issues' },
      },
      reports: {
        snyk: { state: 'found', captures: [], navigation: [{ key: 'snyk-report', localAnchor: '#snyk-test-report', state: 'found', liveUrl: 'https://snyk.example/' }], warnings: [], summary: { counts: { critical: 0, high: 0, medium: 0, low: 0 }, detail: { totalObserved: 0, retainedCount: 0, truncated: false, omittedCount: 0 } }, findings: [] },
        sonarqube: { state: 'found', captures: [], navigation: [{ key: 'sonarqube-home', localAnchor: '#sonarqube-home', state: 'found', liveUrl: 'https://sonar.example/' }, { key: 'sonarqube-overall', localAnchor: '#sonarqube-overall', state: 'found', liveUrl: 'https://sonar.example/overall' }, { key: 'sonarqube-issues', localAnchor: '#sonarqube-issues', state: 'found', liveUrl: 'https://sonar.example/issues' }], warnings: [], facets: { types: [], severities: [] } },
      },
      warnings: [],
    }),
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body>Static Report Content</body></html>', 'utf8');
}

function initReportRoot(reportRoot: string): void {
  fs.writeFileSync(
    path.join(reportRoot, 'index.html'),
    `<!DOCTYPE html><html><head>${AGGREGATE_REPORT_MARKER}</head><body>Index</body></html>`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(reportRoot, 'aggregate-data.json'),
    JSON.stringify({ schemaVersion: 3, generatedAt: '2026-09-24T10:00:00.000Z', projects: [], warnings: [] }),
    'utf8',
  );
}

test.describe('Control Final Project Report Route', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let serverPort: number;
  let closeServer: () => Promise<void>;
  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-rep-'));
    initReportRoot(reportRoot);
    createValidRunFiles(reportRoot, 'service-a', 'run-1');

    fs.writeFileSync(
      path.join(configRoot, 'default.json'),
      JSON.stringify({ schemaVersion: 1, projects: [] }),
      'utf8',
    );

    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
    });
    serverUrl = server.url;
    serverPort = server.port;
    closeServer = server.close;
  });

  test.afterEach(async () => {
    if (closeServer) await closeServer();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('serves React control shell on GET for existing final report index.html', async () => {
    const res = await fetch(`${serverUrl}reports/service-a/run-1/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toBe(REPORT_CSP);

    const text = await res.text();
    expect(text).toContain('id="root"');
    expect(text).toContain('assets/control-page.js');
    expect(text).not.toContain('Static Report Content');
  });

  test('serves HEAD for existing final report index.html with matching content-length and no body', async () => {
    const getRes = await fetch(`${serverUrl}reports/service-a/run-1/index.html`);
    const getLength = getRes.headers.get('content-length');

    const headRes = await fetch(`${serverUrl}reports/service-a/run-1/index.html`, { method: 'HEAD' });
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get('content-length')).toBe(getLength);
    const body = await headRes.text();
    expect(body).toBe('');
  });

  test('returns 405 Method Not Allowed for unsupported HTTP methods', async () => {
    const res = await fetch(`${serverUrl}reports/service-a/run-1/index.html`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });

  test('canonicalizes directory-form requests to explicit index.html with 302', async () => {
    const trailingRes = await fetch(`${serverUrl}reports/service-a/run-1/`, { redirect: 'manual' });
    expect(trailingRes.status).toBe(302);
    expect(trailingRes.headers.get('location')).toBe('/reports/service-a/run-1/index.html');

    const noTrailingRes = await fetch(`${serverUrl}reports/service-a/run-1`, { redirect: 'manual' });
    expect(noTrailingRes.status).toBe(302);
    expect(noTrailingRes.headers.get('location')).toBe('/reports/service-a/run-1/index.html');
  });

  test('returns 404 when report index does not exist without leaking control shell', async () => {
    const res = await fetch(`${serverUrl}reports/service-a/non-existent-run/index.html`);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain('id="root"');
    expect(text).toContain('report file not found');
  });

  test('serves sibling static files under static report handler and REPORT_CSP', async () => {
    const dataRes = await fetch(`${serverUrl}reports/service-a/run-1/data.json`);
    expect(dataRes.status).toBe(200);
    expect(dataRes.headers.get('content-security-policy')).toBe(REPORT_CSP);
    const data = await dataRes.json();
    expect(data.project.id).toBe('service-a');

    const manifestRes = await fetch(`${serverUrl}reports/service-a/run-1/manifest.json`);
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get('content-security-policy')).toBe(REPORT_CSP);
    const manifest = await manifestRes.json();
    expect(manifest.project.id).toBe('service-a');
  });

  test('rejects path traversal, encoded separators and invalid IDs', async () => {
    const doubleEncodedRes = await fetch(`${serverUrl}reports/service-a/%252e%252e/index.html`);
    expect([400, 404]).toContain(doubleEncodedRes.status);

    const encodedSlashRes = await fetch(`${serverUrl}reports/service%2fa/run-1/index.html`);
    expect([400, 404]).toContain(encodedSlashRes.status);

    const uppercaseRes = await fetch(`${serverUrl}reports/SERVICE-A/run-1/index.html`);
    // Control shell must never be served for uppercase ID; falls back to static handler under REPORT_CSP
    expect(uppercaseRes.headers.get('content-security-policy')).toBe(REPORT_CSP);

    const invalidCharRes = await fetch(`${serverUrl}reports/service-a/invalid_run!/index.html`);
    expect(invalidCharRes.status).toBe(404);
  });
});

test.describe('Standalone Report Server (non-control mode)', () => {
  let reportRoot: string;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-only-'));
    initReportRoot(reportRoot);
    createValidRunFiles(reportRoot, 'service-a', 'run-1');

    const server = await createReportServer(reportRoot, {
      mode: 'report',
      host: '127.0.0.1',
      port: 0,
    });
    serverUrl = server.url;
    closeServer = server.close;
  });

  test.afterEach(async () => {
    if (closeServer) await closeServer();
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('serves static HTML directly under REPORT_CSP without React shell', async () => {
    const res = await fetch(`${serverUrl}service-a/run-1/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe(REPORT_CSP);

    const text = await res.text();
    expect(text).toContain('Static Report Content');
    expect(text).not.toContain('id="root"');
  });
});
