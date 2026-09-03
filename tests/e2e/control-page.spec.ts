import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

import { createReportServer } from '../../src/reporting/report-server.js';
import type { NormalizedProjectConfig } from '../../src/config/config-types.js';

const createValidConfig = (artifactDir: string) => ({
  schemaVersion: 1,
  defaults: {
    artifactDir,
  },
  projects: [
    {
      id: 'demo-report-service',
      name: 'Demo Report Service',
      runType: 'report',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/demo-report/job/main/',
    },
    {
      id: 'demo-build-service',
      name: 'Demo Build Service',
      runType: 'auto-build',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/demo-build/job/release%252Fv1/',
    },
  ],
});

test.describe('Control Page Dashboard E2E', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-ui-config-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-ui-report-'));

    fs.mkdirSync(path.join(reportRoot, 'demo-report-service', 'mock-run'), { recursive: true });
    fs.writeFileSync(path.join(reportRoot, 'index.html'), '<title>Vulnerability report index</title><h1>Report Index</h1>', 'utf8');
    fs.writeFileSync(path.join(reportRoot, 'demo-report-service', 'mock-run', 'index.html'), '<title>Vulnerability report index</title><h1>Project Run</h1>', 'utf8');

    fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(createValidConfig(reportRoot), null, 2), 'utf8');

    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
      runManagerOptions: {
        reportExecutor: async (projects: readonly NormalizedProjectConfig[]) => {
          return {
            reportRoot,
            outcomes: projects.map((p) => ({
              projectId: p.id,
              name: p.name,
              state: 'success' as const,
              runId: 'mock-run',
              warnings: [],
            })),
            aggregate: {
              schemaVersion: 3,
              generatedAt: new Date().toISOString(),
              projects: projects.map((p) => ({
                projectId: p.id,
                name: p.name,
                state: 'success' as const,
                runId: 'mock-run',
                reportPath: `${p.id}/mock-run/index.html`,
                runs: [],
                warnings: [],
              })),
              warnings: [],
            },
            manifests: [],
            warnings: [],
            exitCode: 0,
          };
        },
        autoBuildExecutor: async (project: NormalizedProjectConfig) => {
          return {
            projectId: project.id,
            projectName: project.name,
            state: 'submitted' as const,
            jobUrl: project.jobUrl,
            buildPageUrl: `${project.jobUrl}build`,
            submittedAt: new Date().toISOString(),
            responseStatus: 303,
            exitCode: 0,
          };
        },
      },
    });

    serverUrl = server.url;
    closeServer = server.close;
  });

  test.afterEach(async () => {
    if (closeServer) await closeServer();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('loads dashboard, passes accessibility, edits project, saves, and executes runs', async ({ page }) => {
    await page.goto(serverUrl);
    await expect(page).toHaveTitle('Jenkins Control Dashboard');

    // Axe audit
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);

    // Check project cards
    await expect(page.locator('.project-card')).toHaveCount(2);
    await expect(page.locator('text=Demo Report Service')).toBeVisible();
    await expect(page.locator('text=Demo Build Service')).toBeVisible();

    // Toggle enabled checkbox on first project -> Save button enables
    const saveBtn = page.locator('#btn-save');
    await expect(saveBtn).toBeDisabled();

    const enabledCheckbox = page.locator('.project-card input[type="checkbox"]').first();
    await enabledCheckbox.uncheck();
    await expect(saveBtn).toBeEnabled();

    // Click save
    await saveBtn.click();
    await expect(page.locator('#status-banner')).toHaveText(/Configuration saved successfully/i);
    await expect(saveBtn).toBeDisabled();

    // Re-check enabled
    await enabledCheckbox.check();
    await saveBtn.click();
    await expect(page.locator('#status-banner')).toHaveText(/Configuration saved successfully/i);

    // Test Execute Reports
    const runReportsBtn = page.locator('#btn-run-reports');
    await runReportsBtn.click();

    await expect(page.locator('#run-status-badge')).toHaveText(/running|succeeded/i);
    await expect(page.locator('#run-status-badge')).toHaveText('succeeded', { timeout: 10_000 });
    await expect(page.locator('#run-logs')).toContainText('Report run finished');
    const openReportLink = page.locator('#run-result-box a');
    await expect(openReportLink).toBeVisible();
    expect(await openReportLink.getAttribute('href')).toContain('/reports/');

    // Test Auto-Build modal confirmation
    const buildBtn = page.locator('.btn-auto-build').first();
    await buildBtn.click();

    const dialog = page.locator('#build-confirm-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#confirm-project-id')).toHaveText('demo-build-service');

    // Confirm build
    await page.locator('#btn-confirm-build').click();
    await expect(dialog).not.toBeVisible();

    await expect(page.locator('#run-status-badge')).toHaveText('succeeded', { timeout: 10_000 });
    await expect(page.locator('#run-logs')).toContainText('Auto-build run finished with state: submitted');
  });

  test('manages credentials in credential dialog with full a11y, saving, clearing, and zero leakage', async ({ page }) => {
    await page.goto(serverUrl);
    await expect(page).toHaveTitle('Jenkins Control Dashboard');

    const credBtn = page.locator('#btn-credentials');
    await expect(credBtn).toBeVisible();
    await credBtn.click();

    const credDialog = page.locator('#credentials-dialog');
    await expect(credDialog).toBeVisible();

    // Verify Axe accessibility while modal is open
    const modalA11y = await new AxeBuilder({ page }).analyze();
    expect(modalA11y.violations).toEqual([]);

    // Check discovered credential keys
    const passwordInput = page.locator('#secret-input-JENKINS_PASSWORD');
    const usernameInput = page.locator('#secret-input-JENKINS_USERNAME');
    await expect(passwordInput).toBeVisible();
    await expect(usernameInput).toBeVisible();

    // Verify initial badges are 'Missing'
    const badges = credDialog.locator('.badge');
    await expect(badges).toHaveCount(2);
    await expect(badges.nth(0)).toHaveText('Missing');
    await expect(badges.nth(1)).toHaveText('Missing');

    // Save with no changes entered
    const saveCredBtn = page.locator('#btn-save-credentials');
    await saveCredBtn.click();
    await expect(page.locator('#credentials-message')).toHaveText(/No changes entered/i);

    // Enter secret values
    const testPass = 'super-secret-pw-12345';
    const testUser = 'admin-user-jenkins';
    await passwordInput.fill(testPass);
    await usernameInput.fill(testUser);

    // Save
    await saveCredBtn.click();

    await expect(page.locator('#credentials-message')).toHaveText(/Credentials saved successfully/i);
    await expect(page.locator('#status-banner')).toHaveText(/Credentials saved successfully/i);

    // Verify badges are now 'Configured'
    await expect(badges.nth(0)).toHaveText('Configured');
    await expect(badges.nth(1)).toHaveText('Configured');

    // Inputs must be cleared (zero secret leakage in DOM)
    await expect(passwordInput).toHaveValue('');
    await expect(usernameInput).toHaveValue('');

    // Ensure secrets are not present anywhere in HTML
    const htmlContent = await page.content();
    expect(htmlContent).not.toContain(testPass);

    // Clear buttons should now exist
    const clearBtns = credDialog.locator('.btn-clear-credential');
    await expect(clearBtns).toHaveCount(2);

    // Clear JENKINS_PASSWORD
    const clearPasswordBtn = credDialog.locator('.btn-clear-credential[data-key="JENKINS_PASSWORD"]');
    await clearPasswordBtn.click();

    await expect(page.locator('#credentials-message')).toHaveText(/JENKINS_PASSWORD cleared/i);
    const passwordRow = credDialog.locator('.credential-row', { hasText: 'JENKINS_PASSWORD' });
    await expect(passwordRow.locator('.badge')).toHaveText('Missing');
    await expect(passwordRow.locator('.btn-clear-credential')).toHaveCount(0);

    // Cancel / Close dialog
    const cancelBtn = page.locator('#btn-cancel-credentials');
    await cancelBtn.click();
    await expect(credDialog).not.toBeVisible();

    // Reopen dialog and verify persisted presence
    await credBtn.click();
    await expect(credDialog).toBeVisible();

    const reopenedPassRow = credDialog.locator('.credential-row', { hasText: 'JENKINS_PASSWORD' });
    const reopenedUserRow = credDialog.locator('.credential-row', { hasText: 'JENKINS_USERNAME' });
    await expect(reopenedPassRow.locator('.badge')).toHaveText('Missing');
    await expect(reopenedUserRow.locator('.badge')).toHaveText('Configured');
    await expect(reopenedUserRow.locator('.btn-clear-credential')).toBeVisible();

    // Close dialog again
    await cancelBtn.click();
    await expect(credDialog).not.toBeVisible();
  });
});
