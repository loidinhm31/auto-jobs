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
  let requireCredentialsInExecutor = false;

  test.beforeEach(async () => {
    requireCredentialsInExecutor = false;
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
        reportExecutor: async (
          projects: readonly NormalizedProjectConfig[],
          context?: { runtimeEnvironment?: NodeJS.ProcessEnv },
        ) => {
          const env = context?.runtimeEnvironment ?? process.env;
          if (requireCredentialsInExecutor) {
            for (const p of projects) {
              const u = env[p.credentialVariables.usernameVariable];
              const pw = env[p.credentialVariables.passwordVariable];
              if (!u || !pw) {
                throw new Error(
                  `Invalid configuration: ${p.credentialVariables.usernameVariable} is required; ${p.credentialVariables.passwordVariable} is required`,
                );
              }
            }
          }
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
        autoBuildExecutor: async (
          project: NormalizedProjectConfig,
          context?: { runtimeEnvironment?: NodeJS.ProcessEnv },
        ) => {
          const env = context?.runtimeEnvironment ?? process.env;
          if (requireCredentialsInExecutor) {
            const u = env[project.credentialVariables.usernameVariable];
            const pw = env[project.credentialVariables.passwordVariable];
            if (!u || !pw) {
              throw new Error(
                `Invalid configuration: ${project.credentialVariables.usernameVariable} is required; ${project.credentialVariables.passwordVariable} is required`,
              );
            }
          }
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

  test('configures credentials in dialog and enables successful execution run with injected credentials', async ({ page }) => {
    requireCredentialsInExecutor = true;

    await page.goto(serverUrl);
    await expect(page).toHaveTitle('Jenkins Control Dashboard');

    // 1. Initial attempt to execute reports fails because credentials are not configured yet
    const runReportsBtn = page.locator('#btn-run-reports');
    await runReportsBtn.click();
    await expect(page.locator('#run-status-badge')).toHaveText('failed', { timeout: 10_000 });
    await expect(page.locator('#run-logs')).toContainText(
      'Invalid configuration: JENKINS_USERNAME is required; JENKINS_PASSWORD is required',
    );

    // 2. Open Credentials dialog and verify initial Missing badges
    const credBtn = page.locator('#btn-credentials');
    await credBtn.click();
    const credDialog = page.locator('#credentials-dialog');
    await expect(credDialog).toBeVisible();

    const usernameRow = credDialog.locator('.credential-row', { hasText: 'JENKINS_USERNAME' });
    const passwordRow = credDialog.locator('.credential-row', { hasText: 'JENKINS_PASSWORD' });
    await expect(usernameRow.locator('.badge')).toHaveText('Missing');
    await expect(passwordRow.locator('.badge')).toHaveText('Missing');

    // 3. Enter secret values
    const testUsername = 'operator-service-account';
    const testPassword = 'highly-secret-password-xyz987';
    await page.locator('#secret-input-JENKINS_USERNAME').fill(testUsername);
    await page.locator('#secret-input-JENKINS_PASSWORD').fill(testPassword);

    // 4. Save credentials
    await page.locator('#btn-save-credentials').click();
    await expect(page.locator('#credentials-message')).toHaveText(/Credentials saved successfully/i);

    // 5. Verify badges transition to 'Configured'
    await expect(usernameRow.locator('.badge')).toHaveText('Configured');
    await expect(passwordRow.locator('.badge')).toHaveText('Configured');

    // 6. Close Credentials dialog
    await page.locator('#btn-cancel-credentials').click();
    await expect(credDialog).not.toBeVisible();

    // 7. Trigger report execution again: now it must succeed with injected credentials
    await runReportsBtn.click();
    await expect(page.locator('#run-status-badge')).toHaveText('succeeded', { timeout: 10_000 });
    await expect(page.locator('#run-logs')).toContainText('Report run finished with status: succeeded');

    // 8. Zero secret leakage check: password must not appear in DOM or run logs
    const logsContent = await page.locator('#run-logs').innerText();
    expect(logsContent).not.toContain(testPassword);
    const pageHtml = await page.content();
    expect(pageHtml).not.toContain(testPassword);

    // 9. Verify persistence across page reload
    await page.reload();
    await expect(page).toHaveTitle('Jenkins Control Dashboard');
    await credBtn.click();
    await expect(credDialog).toBeVisible();
    await expect(credDialog.locator('.credential-row', { hasText: 'JENKINS_USERNAME' }).locator('.badge')).toHaveText('Configured');
    await expect(credDialog.locator('.credential-row', { hasText: 'JENKINS_PASSWORD' }).locator('.badge')).toHaveText('Configured');
    await page.locator('#btn-cancel-credentials').click();
    await expect(credDialog).not.toBeVisible();
  });
});
