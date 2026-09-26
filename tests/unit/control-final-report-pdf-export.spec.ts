import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { createReportServer } from '../../src/reporting/report-server.js';
import { AGGREGATE_REPORT_MARKER } from '../../src/reporting/report-server-constants.js';

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
      jenkins: { jobUrl: 'https://jenkins.example/job/service-a/' },
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
        snyk: {
          state: 'found',
          captures: [],
          navigation: [{ key: 'snyk-report', localAnchor: '#snyk-test-report', state: 'found', liveUrl: 'https://snyk.example/' }],
          warnings: [],
          summary: { counts: { critical: 0, high: 0, medium: 0, low: 0 }, detail: { totalObserved: 0, retainedCount: 0, truncated: false, omittedCount: 0 } },
          findings: [],
        },
        sonarqube: {
          state: 'found',
          captures: [],
          navigation: [
            { key: 'sonarqube-home', localAnchor: '#sonarqube-home', state: 'found', liveUrl: 'https://sonar.example/' },
            { key: 'sonarqube-overall', localAnchor: '#sonarqube-overall', state: 'found', liveUrl: 'https://sonar.example/overall' },
            { key: 'sonarqube-issues', localAnchor: '#sonarqube-issues', state: 'found', liveUrl: 'https://sonar.example/issues' },
          ],
          warnings: [],
          facets: { types: [], severities: [] },
        },
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

test.describe('Control Final Project Report: PDF Export Integration', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-pdf-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-pdf-rep-'));
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
    closeServer = server.close;
  });

  test.afterEach(async () => {
    if (closeServer) await closeServer();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('renders ReportExportButton and initiates download when clicked', async ({ page }) => {
    await page.goto(`${serverUrl}reports/service-a/run-1/index.html`);
    const surface = page.locator('#project-report-surface');
    const exportBtn = page.locator('#export-pdf-button');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();
    await expect(exportBtn).toHaveText(/Export PDF/);

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await exportBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('service-a-run-1-report.pdf');
  });
});
