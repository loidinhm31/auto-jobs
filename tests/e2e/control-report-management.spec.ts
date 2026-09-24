import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

import { createReportServer } from '../../src/reporting/report-server.js';
import { AGGREGATE_REPORT_MARKER } from '../../src/reporting/report-server-constants.js';
import { acquireReportRootLock } from '../../src/artifacts/report-root-lock-owner.js';

function createValidConfig(artifactDir: string) {
  return {
    schemaVersion: 1,
    defaults: { artifactDir },
    projects: [
      {
        id: 'active-service',
        name: 'Active Service',
        runType: 'report',
        enabled: true,
        loginUrl: 'https://jenkins.example.com/login',
        jobUrl: 'https://jenkins.example.com/job/active-service/job/main/',
      },
    ],
  };
}

function initAggregateIndex(reportRoot: string, projects: readonly unknown[], warnings: readonly string[] = []) {
  fs.writeFileSync(
    path.join(reportRoot, 'index.html'),
    `<!DOCTYPE html><html><head>${AGGREGATE_REPORT_MARKER}<title>Vulnerability report index</title></head><body>Index</body></html>`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(reportRoot, 'aggregate-data.json'),
    JSON.stringify({
      schemaVersion: 3,
      generatedAt: '2026-09-24T12:00:00.000Z',
      projects,
      warnings,
    }, null, 2),
    'utf8',
  );
}

function createProjectRunFiles(reportRoot: string, projectId: string, runId: string) {
  const dir = path.join(reportRoot, projectId, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      kind: 'project-run',
      schemaVersion: 3,
      project: { id: projectId, name: `Project ${projectId}` },
      run: { runId, observedAt: '2026-09-24T10:00:00.000Z' },
      state: 'failed',
      artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
      warnings: [],
      diagnostic: 'test failure',
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'data.json'),
    JSON.stringify({
      schemaVersion: 3,
      project: { id: projectId, name: `Project ${projectId}` },
      run: { runId, observedAt: '2026-09-24T10:00:00.000Z' },
      state: 'failed',
      diagnostic: 'test failure',
      warnings: [],
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><title>Run ${runId}</title></head><body>Report ${runId}</body></html>`,
    'utf8',
  );
}

test.describe('Control Report Management Page & Deletion E2E (Phase 03)', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-mgmt-config-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-mgmt-report-'));

    fs.writeFileSync(
      path.join(configRoot, 'default.json'),
      JSON.stringify(createValidConfig(reportRoot), null, 2),
      'utf8',
    );

    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
    });

    serverUrl = server.url;
    closeServer = async () => {
      await server.close();
      fs.rmSync(configRoot, { recursive: true, force: true });
      fs.rmSync(reportRoot, { recursive: true, force: true });
    };
  });

  test.afterEach(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  test('navigates from dashboard header to report management page and back', async ({ page }) => {
    // 1. Load dashboard
    await page.goto(serverUrl);
    await expect(page).toHaveTitle('Jenkins Control Dashboard');

    // 2. Reports link in header
    const reportsLink = page.locator('#header-reports-link');
    await expect(reportsLink).toBeVisible();
    await expect(reportsLink).toHaveText('Reports');

    // 3. Click Reports link -> navigates to /reports/index.html
    await reportsLink.click();
    await expect(page).toHaveURL(`${serverUrl}reports/index.html`);

    // 4. On reports page, verify observable headings and elements
    await expect(page.getByRole('heading', { name: 'Vulnerability report index' })).toBeVisible();
    const backLink = page.locator('#back-to-dashboard-link');
    await expect(backLink).toBeVisible();
    await expect(backLink).toContainText('Back to Dashboard');

    // 5. Click Back link -> navigates back to /
    await backLink.click();
    await expect(page).toHaveURL(new RegExp(`^${serverUrl}(\\?.*)?$`));
    await expect(page).toHaveTitle('Jenkins Control Dashboard');
  });

  test('displays empty state when aggregate index is not yet generated', async ({ page }) => {
    // No aggregate-data.json exists initially
    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.getByRole('heading', { name: 'Vulnerability report index' })).toBeVisible();

    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No retained project reports were recorded.');

    // No Delete buttons exposed
    expect(await page.locator('button:has-text("Delete Reports")').count()).toBe(0);
  });

  test('renders retained project inventory across configs, pagination by 20, and confirmed deletion', async ({ page }) => {
    // Create 25 runs for multi-run-project, and 2 runs for retired-project (not in config)
    for (let i = 1; i <= 25; i++) {
      const runId = `run-${String(i).padStart(2, '0')}`;
      createProjectRunFiles(reportRoot, 'multi-run-project', runId);
    }
    createProjectRunFiles(reportRoot, 'retired-project', 'run-01');
    createProjectRunFiles(reportRoot, 'retired-project', 'run-02');

    const multiRuns = Array.from({ length: 25 }, (_, idx) => {
      const num = 25 - idx; // newest first
      const runId = `run-${String(num).padStart(2, '0')}`;
      return {
        runId,
        state: 'success' as const,
        jobId: '100',
        branch: 'main',
        manifestPath: `multi-run-project/${runId}/manifest.json`,
        reportPath: `multi-run-project/${runId}/index.html`,
        warnings: [],
      };
    });

    const retiredRuns = [
      {
        runId: 'run-02',
        state: 'failed' as const,
        jobId: '200',
        branch: 'feature',
        manifestPath: 'retired-project/run-02/manifest.json',
        reportPath: 'retired-project/run-02/index.html',
        warnings: ['Snyk token expired'],
      },
      {
        runId: 'run-01',
        state: 'success' as const,
        jobId: '199',
        branch: 'feature',
        manifestPath: 'retired-project/run-01/manifest.json',
        reportPath: 'retired-project/run-01/index.html',
        warnings: [],
      },
    ];

    initAggregateIndex(reportRoot, [
      {
        projectId: 'multi-run-project',
        name: 'Multi Run Project',
        state: 'success',
        reportPath: 'multi-run-project/run-25/index.html',
        runs: multiRuns,
        warnings: [],
      },
      {
        projectId: 'retired-project',
        name: 'Retired Project',
        state: 'failed',
        reportPath: 'retired-project/run-02/index.html',
        runs: retiredRuns,
        warnings: ['Project deprecated'],
      },
    ], ['Global aggregate warning: 1 manifest had deprecation notice']);

    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.getByRole('heading', { name: 'Vulnerability report index' })).toBeVisible();

    // Verify aggregate warnings
    const aggWarnings = page.locator('#aggregate-warnings');
    await expect(aggWarnings).toBeVisible();
    await expect(aggWarnings).toContainText('Global aggregate warning');

    // Verify both projects are rendered
    await expect(page.locator('#project-multi-run-project')).toBeVisible();
    await expect(page.locator('#project-retired-project')).toBeVisible();

    // Verify table headers
    await expect(page.getByRole('columnheader', { name: 'Run' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Job ID' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Branch' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'State' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Artifacts' }).first()).toBeVisible();

    // Verify 20-run pagination on multi-run-project
    const multiCard = page.locator('.project-card', { hasText: 'Multi Run Project' });
    await expect(multiCard.locator('tbody tr')).toHaveCount(20);
    await expect(multiCard.locator('.pagination')).toContainText('Page 1 of 2');

    // Click Next
    const nextBtn = multiCard.getByRole('button', { name: 'Next page for Multi Run Project' });
    await nextBtn.click();
    await expect(multiCard.locator('tbody tr')).toHaveCount(5);
    await expect(multiCard.locator('.pagination')).toContainText('Page 2 of 2');

    // Click Previous
    const prevBtn = multiCard.getByRole('button', { name: 'Previous page for Multi Run Project' });
    await prevBtn.click();
    await expect(multiCard.locator('tbody tr')).toHaveCount(20);
    await expect(multiCard.locator('.pagination')).toContainText('Page 1 of 2');

    // Retired project has only 2 runs <= 20, so its pagination should be hidden
    const retiredCard = page.locator('.project-card', { hasText: 'Retired Project' });
    await expect(retiredCard.locator('tbody tr')).toHaveCount(2);
    expect(await retiredCard.locator('.pagination').count()).toBe(0);

    // Axe audit for accessibility
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    // Confirmed deletion of retired-project
    const deleteRetiredBtn = page.locator('#delete-project-retired-project-btn');
    await expect(deleteRetiredBtn).toBeVisible();
    await deleteRetiredBtn.click();

    // Dialog is open
    const dialog = page.locator('#delete-reports-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#delete-dialog-title')).toHaveText('Delete Project Reports');
    await expect(dialog.locator('#delete-dialog-description')).toContainText('Retired Project');
    await expect(dialog.locator('#delete-dialog-description')).toContainText('retired-project');
    await expect(dialog.locator('#delete-dialog-description')).toContainText('All 2 historical report files');

    // Test Cancel button leaves disk and UI intact
    await page.locator('#cancel-delete-btn').click();
    await expect(dialog).toBeHidden();
    expect(fs.existsSync(path.join(reportRoot, 'retired-project'))).toBe(true);
    await expect(page.locator('#project-retired-project')).toBeVisible();

    // Open delete dialog again and confirm
    await deleteRetiredBtn.click();
    await expect(dialog).toBeVisible();
    await page.locator('#confirm-delete-btn').click();

    // Wait for dialog to close and feedback banner
    await expect(dialog).toBeHidden();
    const banner = page.locator('#report-feedback-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Successfully deleted');
    await expect(banner).toContainText('retired-project');

    // Verify retired-project disk folder was removed
    expect(fs.existsSync(path.join(reportRoot, 'retired-project'))).toBe(false);
    // Sibling project still exists
    expect(fs.existsSync(path.join(reportRoot, 'multi-run-project'))).toBe(true);

    // UI updated: retired-project card is gone, multi-run-project remains
    await expect(page.locator('#project-retired-project')).toBeHidden();
    await expect(page.locator('#project-multi-run-project')).toBeVisible();
  });

  test('handles 409 conflict during deletion with retry hint', async ({ page }) => {
    createProjectRunFiles(reportRoot, 'locked-project', 'run-01');
    initAggregateIndex(reportRoot, [
      {
        projectId: 'locked-project',
        name: 'Locked Project',
        state: 'success',
        reportPath: 'locked-project/run-01/index.html',
        runs: [{
          runId: 'run-01',
          state: 'success',
          jobId: '1',
          branch: 'main',
          manifestPath: 'locked-project/run-01/manifest.json',
          reportPath: 'locked-project/run-01/index.html',
          warnings: [],
        }],
        warnings: [],
      },
    ]);

    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.locator('#project-locked-project')).toBeVisible();

    // Acquire lock externally to simulate running job/worker
    const lock = await acquireReportRootLock(reportRoot);
    try {
      await page.locator('#delete-project-locked-project-btn').click();
      const dialog = page.locator('#delete-reports-dialog');
      await expect(dialog).toBeVisible();
      await page.locator('#confirm-delete-btn').click();

      // Error message appears in dialog with 409 hint
      const errorMsg = page.locator('#delete-error-message');
      await expect(errorMsg).toBeVisible();
      await expect(errorMsg).toContainText('Server is currently busy or another operation holds the report lock');
    } finally {
      await lock.release();
    }
  });
});
