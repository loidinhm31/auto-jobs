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

  test('enforces independent pagination boundaries (20 runs unpaginated vs 21 runs paginated) and escape key dialog dismissal', async ({ page }) => {
    // Project with exactly 20 runs
    for (let i = 1; i <= 20; i++) {
      createProjectRunFiles(reportRoot, 'project-twenty', `run-${String(i).padStart(2, '0')}`);
    }
    const twentyRuns = Array.from({ length: 20 }, (_, idx) => ({
      runId: `run-${String(20 - idx).padStart(2, '0')}`,
      state: 'success' as const,
      jobId: '10',
      branch: 'main',
      manifestPath: `project-twenty/run-${String(20 - idx).padStart(2, '0')}/manifest.json`,
      reportPath: `project-twenty/run-${String(20 - idx).padStart(2, '0')}/index.html`,
      warnings: [],
    }));

    // Project with exactly 21 runs
    for (let i = 1; i <= 21; i++) {
      createProjectRunFiles(reportRoot, 'project-twenty-one', `run-${String(i).padStart(2, '0')}`);
    }
    const twentyOneRuns = Array.from({ length: 21 }, (_, idx) => ({
      runId: `run-${String(21 - idx).padStart(2, '0')}`,
      state: 'success' as const,
      jobId: '20',
      branch: 'main',
      manifestPath: `project-twenty-one/run-${String(21 - idx).padStart(2, '0')}/manifest.json`,
      reportPath: `project-twenty-one/run-${String(21 - idx).padStart(2, '0')}/index.html`,
      warnings: [],
    }));

    initAggregateIndex(reportRoot, [
      {
        projectId: 'project-twenty',
        name: 'Project Twenty',
        state: 'success',
        reportPath: 'project-twenty/run-20/index.html',
        runs: twentyRuns,
        warnings: [],
      },
      {
        projectId: 'project-twenty-one',
        name: 'Project Twenty One',
        state: 'success',
        reportPath: 'project-twenty-one/run-21/index.html',
        runs: twentyOneRuns,
        warnings: [],
      },
    ]);

    await page.goto(`${serverUrl}reports/index.html`);

    const cardTwenty = page.locator('.project-card', { has: page.locator('#project-project-twenty') });
    await expect(cardTwenty.locator('tbody tr')).toHaveCount(20);
    // Exactly 20 runs: pagination controls are NOT displayed
    expect(await cardTwenty.locator('.pagination').count()).toBe(0);

    const cardTwentyOne = page.locator('.project-card', { has: page.locator('#project-project-twenty-one') });
    await expect(cardTwentyOne.locator('tbody tr')).toHaveCount(20);
    // Exactly 21 runs: pagination is displayed (Page 1 of 2)
    await expect(cardTwentyOne.locator('.pagination')).toBeVisible();
    await expect(cardTwentyOne.locator('.pagination')).toContainText('Page 1 of 2');

    // Navigate to page 2 of Twenty One
    await cardTwentyOne.getByRole('button', { name: 'Next page for Project Twenty One' }).click();
    await expect(cardTwentyOne.locator('tbody tr')).toHaveCount(1);
    await expect(cardTwentyOne.locator('.pagination')).toContainText('Page 2 of 2');

    // Sibling project Twenty is completely unchanged
    await expect(cardTwenty.locator('tbody tr')).toHaveCount(20);
    expect(await cardTwenty.locator('.pagination').count()).toBe(0);

    // Open delete dialog and press Escape key to dismiss
    await cardTwenty.locator('#delete-project-project-twenty-btn').click();
    const dialog = page.locator('#delete-reports-dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Both projects remain visible and disk files untouched
    await expect(page.locator('#project-project-twenty')).toBeVisible();
    await expect(page.locator('#project-project-twenty-one')).toBeVisible();
    expect(fs.existsSync(path.join(reportRoot, 'project-twenty'))).toBe(true);
  });

  test('final project deletion transitions UI to empty state and updates published disk files', async ({ page }) => {
    createProjectRunFiles(reportRoot, 'sole-project', 'run-01');
    initAggregateIndex(reportRoot, [
      {
        projectId: 'sole-project',
        name: 'Sole Project',
        state: 'success',
        reportPath: 'sole-project/run-01/index.html',
        runs: [{
          runId: 'run-01',
          state: 'success',
          jobId: '1',
          branch: 'main',
          manifestPath: 'sole-project/run-01/manifest.json',
          reportPath: 'sole-project/run-01/index.html',
          warnings: [],
        }],
        warnings: [],
      },
    ]);

    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.locator('#project-sole-project')).toBeVisible();

    // Delete the sole remaining project
    await page.locator('#delete-project-sole-project-btn').click();
    const dialog = page.locator('#delete-reports-dialog');
    await expect(dialog).toBeVisible();
    await page.locator('#confirm-delete-btn').click();

    await expect(dialog).toBeHidden();
    const banner = page.locator('#report-feedback-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Successfully deleted');

    // UI transitions to empty state
    await expect(page.locator('#project-sole-project')).toBeHidden();
    await expect(page.getByText('No retained project reports were recorded.')).toBeVisible();

    // On-disk files are updated
    expect(fs.existsSync(path.join(reportRoot, 'sole-project'))).toBe(false);
    const aggData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    expect(aggData.projects).toEqual([]);
    expect(aggData.schemaVersion).toBe(3);

    const indexHtml = fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain(AGGREGATE_REPORT_MARKER);
    expect(indexHtml).toContain('0 retained project(s)');
  });

  test('handles 500 error during deletion and displays error feedback in dialog', async ({ page }) => {
    createProjectRunFiles(reportRoot, 'error-proj', 'run-01');
    initAggregateIndex(reportRoot, [
      {
        projectId: 'error-proj',
        name: 'Error Project',
        state: 'success',
        reportPath: 'error-proj/run-01/index.html',
        runs: [{
          runId: 'run-01',
          state: 'success',
          jobId: '1',
          branch: 'main',
          manifestPath: 'error-proj/run-01/manifest.json',
          reportPath: 'error-proj/run-01/index.html',
          warnings: [],
        }],
        warnings: [],
      },
    ]);

    // Intercept DELETE request and return 500
    await page.route('**/api/reports/projects/error-proj', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'REMOVAL_FAILED',
              message: 'Simulated filesystem removal failure on server',
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.locator('#project-error-proj')).toBeVisible();

    await page.locator('#delete-project-error-proj-btn').click();
    const dialog = page.locator('#delete-reports-dialog');
    await expect(dialog).toBeVisible();
    await page.locator('#confirm-delete-btn').click();

    // Dialog remains open with 500 error message
    const errorMsg = page.locator('#delete-error-message');
    await expect(errorMsg).toBeVisible();
    await expect(errorMsg).toContainText('Simulated filesystem removal failure on server');

    // Cancel button closes dialog and project remains
    await page.locator('#cancel-delete-btn').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#project-error-proj')).toBeVisible();
  });

  test('deletes individual report run with confirmation, preserving sibling runs', async ({ page }) => {
    createProjectRunFiles(reportRoot, 'project-alpha', 'run-01');
    createProjectRunFiles(reportRoot, 'project-alpha', 'run-02');

    initAggregateIndex(reportRoot, [
      {
        projectId: 'project-alpha',
        name: 'Project Alpha',
        state: 'success',
        reportPath: 'project-alpha/run-02/index.html',
        runs: [
          {
            runId: 'run-02',
            state: 'success',
            jobId: '102',
            branch: 'main',
            manifestPath: 'project-alpha/run-02/manifest.json',
            reportPath: 'project-alpha/run-02/index.html',
            warnings: [],
          },
          {
            runId: 'run-01',
            state: 'success',
            jobId: '101',
            branch: 'main',
            manifestPath: 'project-alpha/run-01/manifest.json',
            reportPath: 'project-alpha/run-01/index.html',
            warnings: [],
          },
        ],
        warnings: [],
      },
    ]);

    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.locator('#project-project-alpha')).toBeVisible();

    // Both run delete buttons are visible
    const deleteRun01Btn = page.locator('#delete-run-run-01-btn');
    const deleteRun02Btn = page.locator('#delete-run-run-02-btn');
    await expect(deleteRun01Btn).toBeVisible();
    await expect(deleteRun02Btn).toBeVisible();

    // 1. Test Cancel on run-01
    await deleteRun01Btn.click();
    const dialog = page.locator('#delete-run-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#delete-run-dialog-title')).toHaveText('Delete Report Run');
    await expect(dialog.locator('#delete-run-dialog-description')).toContainText('run-01');
    await expect(dialog.locator('#delete-run-dialog-description')).toContainText('Project Alpha');

    // Axe audit for accessibility on DeleteRunConfirmationDialog and per-run action
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await page.locator('#cancel-delete-run-btn').click();
    await expect(dialog).toBeHidden();
    expect(fs.existsSync(path.join(reportRoot, 'project-alpha', 'run-01'))).toBe(true);
    expect(fs.existsSync(path.join(reportRoot, 'project-alpha', 'run-02'))).toBe(true);

    // 2. Confirm deletion of run-01
    await deleteRun01Btn.click();
    await expect(dialog).toBeVisible();
    await page.locator('#confirm-delete-run-btn').click();

    // Dialog closes, success banner appears
    await expect(dialog).toBeHidden();
    const banner = page.locator('#report-feedback-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Successfully deleted report run run-01 for Project Alpha');

    // On disk: run-01 removed, run-02 preserved
    expect(fs.existsSync(path.join(reportRoot, 'project-alpha', 'run-01'))).toBe(false);
    expect(fs.existsSync(path.join(reportRoot, 'project-alpha', 'run-02'))).toBe(true);

    // On UI: run-01 row is gone, run-02 row remains
    await expect(page.locator('#delete-run-run-01-btn')).toBeHidden();
    await expect(page.locator('#delete-run-run-02-btn')).toBeVisible();

    // Aggregate index (aggregate-data.json and static index.html) updates accurately
    const aggregateData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    const alphaProj = aggregateData.projects.find((p: { projectId: string }) => p.projectId === 'project-alpha');
    expect(alphaProj).toBeDefined();
    expect(alphaProj.runs).toHaveLength(1);
    expect(alphaProj.runs[0].runId).toBe('run-02');
    const indexHtml = fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain(AGGREGATE_REPORT_MARKER);
  });

  test('deleting last remaining run prunes project folder and updates UI', async ({ page }) => {
    createProjectRunFiles(reportRoot, 'solo-project', 'run-only');

    initAggregateIndex(reportRoot, [
      {
        projectId: 'solo-project',
        name: 'Solo Project',
        state: 'success',
        reportPath: 'solo-project/run-only/index.html',
        runs: [
          {
            runId: 'run-only',
            state: 'success',
            jobId: '50',
            branch: 'main',
            manifestPath: 'solo-project/run-only/manifest.json',
            reportPath: 'solo-project/run-only/index.html',
            warnings: [],
          },
        ],
        warnings: [],
      },
    ]);

    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.locator('#project-solo-project')).toBeVisible();

    const deleteBtn = page.locator('#delete-run-run-only-btn');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const dialog = page.locator('#delete-run-dialog');
    await expect(dialog).toBeVisible();
    await page.locator('#confirm-delete-run-btn').click();

    await expect(dialog).toBeHidden();
    const banner = page.locator('#report-feedback-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Successfully deleted report run run-only for Solo Project');

    // Project directory pruned from disk
    expect(fs.existsSync(path.join(reportRoot, 'solo-project'))).toBe(false);

    // UI reflects empty state since no projects remain
    await expect(page.locator('#project-solo-project')).toBeHidden();
    await expect(page.locator('.empty-state')).toContainText('No retained project reports were recorded.');

    // Aggregate reflects 0 projects and valid index.html
    const aggregateData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    expect(aggregateData.projects).toEqual([]);
    const indexHtml = fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain(AGGREGATE_REPORT_MARKER);
  });

  test('handles 409 conflict during individual run deletion', async ({ page }) => {
    createProjectRunFiles(reportRoot, 'locked-run-project', 'run-99');

    initAggregateIndex(reportRoot, [
      {
        projectId: 'locked-run-project',
        name: 'Locked Run Project',
        state: 'success',
        reportPath: 'locked-run-project/run-99/index.html',
        runs: [
          {
            runId: 'run-99',
            state: 'success',
            jobId: '99',
            branch: 'main',
            manifestPath: 'locked-run-project/run-99/manifest.json',
            reportPath: 'locked-run-project/run-99/index.html',
            warnings: [],
          },
        ],
        warnings: [],
      },
    ]);

    await page.goto(`${serverUrl}reports/index.html`);
    await expect(page.locator('#project-locked-run-project')).toBeVisible();

    const lock = await acquireReportRootLock(reportRoot);
    try {
      await page.locator('#delete-run-run-99-btn').click();
      const dialog = page.locator('#delete-run-dialog');
      await expect(dialog).toBeVisible();
      await page.locator('#confirm-delete-run-btn').click();

      const errorMsg = page.locator('#delete-run-error-message');
      await expect(errorMsg).toBeVisible();
      await expect(errorMsg).toContainText('Server is currently busy or another operation holds the report lock');

      await page.locator('#cancel-delete-run-btn').click();
      await expect(dialog).toBeHidden();
    } finally {
      await lock.release();
    }
  });
});
