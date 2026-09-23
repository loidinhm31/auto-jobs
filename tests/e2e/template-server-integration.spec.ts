import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { loadProjectConfig, normalizeProjectConfigDocument } from '../../src/config/project-config-loader.js';
import { runAutoBuildProject } from '../../src/project/auto-build-runner.js';
import { createReportServer } from '../../src/reporting/report-server.js';
import { runConfiguredProjects } from '../../src/runner.js';
import { createTemplateServer, type TemplateServerHandle } from '../../src/templates/template-server.js';

test.describe('Template Server Validation & Integration (Phase 05)', () => {
  let templateServer: TemplateServerHandle;
  let reportRoot: string;
  let configRoot: string;

  test.beforeEach(async () => {
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'template-e2e-report-'));
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'template-e2e-config-'));
    templateServer = await createTemplateServer({ host: '127.0.0.1', port: 0 });
  });

  test.afterEach(async () => {
    if (templateServer) {
      await templateServer.close();
    }
    fs.rmSync(reportRoot, { recursive: true, force: true });
    fs.rmSync(configRoot, { recursive: true, force: true });
  });

  test.describe('Manual Smoke Test Automation', () => {
    test('renders Developer Hub on / and /index.html with all mock endpoints, badges, and headers', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      const response = await page.goto(templateServer.url);
      expect(response).not.toBeNull();
      expect(response?.status()).toBe(200);

      // Verify security headers
      const headers = response?.headers() ?? {};
      expect(headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['cache-control']).toContain('no-store');

      // Verify Hub content and styling elements
      await expect(page).toHaveTitle('Template Mock Server - Developer Hub');
      await expect(page.locator('h1')).toHaveText('Template Mock Server');
      await expect(page.locator('.server-status')).toHaveText('● Ready');

      // Verify all 9 expected endpoints are listed
      const expectedItems = [
        { name: 'Jenkins Login', badge: 'Jenkins', url: templateServer.fixture.loginUrl },
        { name: 'Jenkins Job Page', badge: 'Jenkins', url: templateServer.fixture.jobUrl },
        { name: 'Jenkins Build (Parameterized)', badge: 'Jenkins', url: templateServer.fixture.buildPageUrl },
        { name: 'Snyk Report', badge: 'Snyk', url: templateServer.fixture.snykReportUrl },
        { name: 'Snyk Summary (JSON)', badge: 'Snyk', url: templateServer.fixture.snykSummaryUrl },
        { name: 'SonarQube Login', badge: 'SonarQube', url: templateServer.fixture.sonarqubeLoginUrl },
        { name: 'SonarQube Home', badge: 'SonarQube', url: templateServer.fixture.sonarqubeHomeUrl },
        { name: 'SonarQube Overall', badge: 'SonarQube', url: templateServer.fixture.sonarqubeOverallUrl },
        { name: 'SonarQube Issues', badge: 'SonarQube', url: templateServer.fixture.sonarqubeIssuesUrl },
      ];

      for (const item of expectedItems) {
        const link = page.locator(`a[href="${item.url}"]`);
        await expect(link).toBeVisible();
        await expect(link).toHaveText(item.name);
      }

      // Verify /index.html alias also serves Developer Hub identically
      const aliasRes = await page.goto(`${templateServer.url}index.html`);
      expect(aliasRes?.status()).toBe(200);
      expect(aliasRes?.headers()['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
      await expect(page).toHaveTitle('Template Mock Server - Developer Hub');

      // Verify no browser console errors occurred on the Developer Hub
      expect(consoleErrors).toEqual([]);
    });

    test('navigates to each Developer Hub link and renders valid fixture content', async ({ page }) => {
      // 1. Jenkins Login
      let res = await page.goto(templateServer.fixture.loginUrl);
      expect(res?.status()).toBe(200);
      await expect(page.locator('form[action*="j_spring_security_check"], form[action*="login"]')).toBeVisible();

      // 2. Jenkins Job Page (with URL encoding edge cases)
      res = await page.goto(templateServer.fixture.jobUrl);
      expect(res?.status()).toBe(200);
      expect(await page.title()).toContain('Jenkins');

      // 3. Jenkins Build Page
      res = await page.goto(templateServer.fixture.buildPageUrl);
      expect(res?.status()).toBe(200);
      await expect(page.locator('#main-panel form, form[action*="build"]')).toBeVisible();

      // 4. Snyk Report
      res = await page.goto(templateServer.fixture.snykReportUrl);
      expect(res?.status()).toBe(200);
      expect(await res?.text()).toContain('Snyk');

      // 5. Snyk Summary JSON
      res = await page.goto(templateServer.fixture.snykSummaryUrl);
      expect(res?.status()).toBe(200);
      const json = await res?.json();
      expect(json.severity_counts).toBeDefined();

      // 6. SonarQube Login
      res = await page.goto(templateServer.fixture.sonarqubeLoginUrl);
      expect(res?.status()).toBe(200);
      await expect(page.locator('#login-input, input[name="login"]')).toBeVisible();

      // Note: SonarQube Home is intentionally tested in the dedicated auth flow test below

      // 7. SonarQube Overall
      res = await page.goto(templateServer.fixture.sonarqubeOverallUrl);
      expect(res?.status()).toBe(200);
      expect(await page.content()).toContain('SonarQube');

      // 8. SonarQube Issues
      res = await page.goto(templateServer.fixture.sonarqubeIssuesUrl);
      expect(res?.status()).toBe(200);
      expect(await page.content()).toContain('SonarQube');
    });

    test('handles Jenkins form POST login flow with 302 redirect in browser', async ({ page }) => {
      await page.goto(templateServer.fixture.loginUrl);

      const usernameInput = page.locator('#j_username, input[name="j_username"]');
      const passwordInput = page.locator('input[name="j_password"]');
      const submitBtn = page.locator('input[type="submit"], button[type="submit"]');

      await usernameInput.fill('template-fixture-user');
      await passwordInput.fill('template-fixture-password');

      await Promise.all([
        page.waitForURL(templateServer.fixture.jobUrl),
        submitBtn.click(),
      ]);

      expect(page.url()).toBe(templateServer.fixture.jobUrl);
      expect(await page.title()).toContain('Jenkins');
    });

    test('SonarQube auth flow guards home dashboard until authenticated, then grants access', async ({ page }) => {
      // 1. Unauthenticated visit to SonarQube home yields login page content
      await page.goto(templateServer.fixture.sonarqubeHomeUrl);
      await expect(page.locator('#login-input, input[name="login"]')).toBeVisible();

      // 2. Submit credentials on SonarQube login page
      await page.locator('#login-input, input[name="login"]').fill('mock-admin');
      await page.locator('#password-input, input[name="password"]').fill('mock-secret');

      await Promise.all([
        page.waitForURL(templateServer.fixture.sonarqubeHomeUrl),
        page.locator('button[type="submit"]').click(),
      ]);

      // 3. Authenticated: SonarQube home now displays project dashboard
      expect(page.url()).toBe(templateServer.fixture.sonarqubeHomeUrl);
      await expect(page.locator('#login-input, input[name="login"]')).toHaveCount(0);
      expect(await page.content()).toContain('SonarQube');
    });

    test('parameterized build form submission flow succeeds with 302 redirect', async ({ page }) => {
      await page.goto(templateServer.fixture.buildPageUrl);

      const buildButton = page.locator('#bottom-sticker button, button[type="submit"], input[type="submit"]');
      await expect(buildButton).toBeVisible();

      await Promise.all([
        page.waitForURL(templateServer.fixture.jobUrl),
        buildButton.click(),
      ]);

      expect(page.url()).toBe(templateServer.fixture.jobUrl);
    });

    test('preserves double-encoded slashes (%252F) in Jenkins job URL without double-decoding errors', async ({ page }) => {
      const response = await page.goto(templateServer.fixture.jobUrl);
      expect(response?.status()).toBe(200);

      // Verify that URL in browser matches the double-encoded path
      expect(page.url()).toContain('release%252Fsit');
      const body = await page.content();
      expect(body).toContain(templateServer.fixture.jenkinsTitle);
    });
  });

  test.describe('Control Page and Runner Integration', () => {
    test('runs Control Server and Template Server concurrently without port conflict', async () => {
      const controlServer = await createReportServer(reportRoot, {
        mode: 'control',
        configRoot,
        host: '127.0.0.1',
        port: 0,
      });

      try {
        expect(controlServer.port).toBeGreaterThan(0);
        expect(templateServer.port).toBeGreaterThan(0);
        expect(controlServer.port).not.toBe(templateServer.port);

        // Fetch from Control Server
        const controlRes = await fetch(controlServer.url);
        expect(controlRes.status).toBe(200);
        expect(controlRes.headers.get('content-type')).toContain('text/html');
        expect(await controlRes.text()).toContain('Jenkins Control Dashboard');

        // Fetch from Template Server
        const templateRes = await fetch(templateServer.url);
        expect(templateRes.status).toBe(200);
        expect(templateRes.headers.get('content-type')).toContain('text/html');
        expect(await templateRes.text()).toContain('Template Mock Server');
      } finally {
        await controlServer.close();
      }
    });

    test('loads and validates config/projects.template.json schema-v1 document cleanly', () => {
      const configPath = path.resolve('config/projects.template.json');
      const rawContent = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(rawContent);

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.projects).toHaveLength(1);
      expect(parsed.projects[0].id).toBe('template-fixture-service');
      expect(parsed.projects[0].name).toBe('Template Fixture Service');
      expect(parsed.projects[0].runType).toBe('report');

      const normalized = loadProjectConfig(configPath, {
        TEMPLATE_FIXTURE_USERNAME: 'test-user',
        TEMPLATE_FIXTURE_PASSWORD: 'test-password',
      });

      expect(normalized).toHaveLength(1);
      const project = normalized[0]!;
      expect(project.id).toBe('template-fixture-service');
      expect(project.loginUrl).toBe('http://127.0.0.1:4174/login');
      expect(project.sourceOrigins.jenkins).toBe('http://127.0.0.1:4174');
      expect(project.sourceOrigins.snyk).toEqual(['http://127.0.0.1:4174']);
      expect(project.sourceOrigins.sonarqube).toEqual(['http://127.0.0.1:4174']);
    });

    test('executes production report capture against real template server and produces evidence artifacts', async () => {
      test.setTimeout(60_000);

      // Create project configuration pointing to active template server instance
      const serverOrigin = new URL(templateServer.url).origin;
      const testProjectDoc = {
        schemaVersion: 1 as const,
        defaults: {
          credentials: {
            usernameVariable: 'TEMPLATE_FIXTURE_USERNAME',
            passwordVariable: 'TEMPLATE_FIXTURE_PASSWORD',
          },
          timeoutMs: 30_000,
          browser: 'chromium' as const,
          artifactDir: reportRoot,
        },
        projects: [
          {
            id: 'template-fixture-service',
            name: 'Template Fixture Service',
            enabled: true,
            runType: 'report' as const,
            loginUrl: templateServer.fixture.loginUrl,
            jobUrl: templateServer.fixture.jobUrl,
            sourceOrigins: {
              jenkins: [serverOrigin],
              snyk: [serverOrigin],
              sonarqube: [serverOrigin],
            },
            sonarqube: {
              projectId: templateServer.fixture.sonarqubeProjectId,
            },
          },
        ],
      };

      const runtimeEnvironment: NodeJS.ProcessEnv = {
        ...process.env,
        TEMPLATE_FIXTURE_USERNAME: 'mock-user',
        TEMPLATE_FIXTURE_PASSWORD: 'mock-password',
        PLAYWRIGHT_HEADLESS: 'true',
        PLAYWRIGHT_SLOW_MO: '0',
      };

      const normalizedProjects = normalizeProjectConfigDocument(testProjectDoc, runtimeEnvironment);
      expect(normalizedProjects).toHaveLength(1);

      // Run production report workflow against the live HTTP template server
      const result = await runConfiguredProjects(normalizedProjects, {
        runtimeEnvironment,
      });

      expect(result.exitCode).toBe(0);
      expect(result.aggregate.projects[0]?.state).toBe('success');
      expect(result.outcomes).toHaveLength(1);

      const outcome = result.outcomes[0]!;
      expect(outcome.state).toBe('success');
      expect(outcome.reportDirectory).toBeDefined();

      // Verify generated report directory and data.json
      const reportDir = outcome.reportDirectory!;
      const dataJsonPath = path.join(reportDir, 'data.json');
      expect(fs.existsSync(dataJsonPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8')) as {
        reports: {
          snyk: { state: string; summary?: { counts: Record<string, number> }; findings?: unknown[] };
          sonarqube: { state: string; facets?: { types: unknown[]; severities: unknown[] } };
        };
      };

      expect(data.reports.snyk.state).toBe('found');
      expect(data.reports.snyk.summary?.counts).toEqual({ critical: 2, high: 4, medium: 0, low: 0 });
      expect(data.reports.snyk.findings).toHaveLength(6);

      expect(data.reports.sonarqube.state).toBe('found');
      expect(data.reports.sonarqube.facets?.types).toHaveLength(3);
      expect(data.reports.sonarqube.facets?.severities).toHaveLength(5);

      // Verify index.html exists in project report directory
      const indexPath = path.join(reportDir, 'index.html');
      expect(fs.existsSync(indexPath)).toBe(true);
    });

    test('executes production auto-build workflow against real template server', async () => {
      test.setTimeout(45_000);

      const serverOrigin = new URL(templateServer.url).origin;
      const autoBuildDoc = {
        schemaVersion: 1 as const,
        defaults: {
          credentials: {
            usernameVariable: 'TEMPLATE_FIXTURE_USERNAME',
            passwordVariable: 'TEMPLATE_FIXTURE_PASSWORD',
          },
          timeoutMs: 25_000,
          browser: 'chromium' as const,
          artifactDir: reportRoot,
        },
        projects: [
          {
            id: 'template-auto-build-service',
            name: 'Template Auto Build Service',
            enabled: true,
            runType: 'auto-build' as const,
            loginUrl: templateServer.fixture.loginUrl,
            jobUrl: templateServer.fixture.jobUrl,
            sourceOrigins: {
              jenkins: [serverOrigin],
              snyk: [],
              sonarqube: [],
            },
          },
        ],
      };

      const runtimeEnvironment: NodeJS.ProcessEnv = {
        ...process.env,
        TEMPLATE_FIXTURE_USERNAME: 'mock-user',
        TEMPLATE_FIXTURE_PASSWORD: 'mock-password',
        PLAYWRIGHT_HEADLESS: 'true',
        PLAYWRIGHT_SLOW_MO: '0',
      };

      const normalized = normalizeProjectConfigDocument(autoBuildDoc, runtimeEnvironment);
      expect(normalized).toHaveLength(1);

      const outcome = await runAutoBuildProject(normalized[0]!, {
        runtimeEnvironment,
      });

      expect(outcome.state).toBe('submitted');
      expect(outcome.exitCode).toBe(0);
      expect(outcome.jobUrl).toBe(templateServer.fixture.jobUrl);
      expect([200, 302, 303]).toContain(outcome.responseStatus);
      expect(outcome.submittedAt).toBeDefined();
    });

    test('Control Page UI loads template config and renders project card without cross-origin errors', async ({ page }) => {
      // Copy projects.template.json into configRoot for Control Server
      const templateConfigSrc = path.resolve('config/projects.template.json');
      fs.copyFileSync(templateConfigSrc, path.join(configRoot, 'default.json'));

      const controlServer = await createReportServer(reportRoot, {
        mode: 'control',
        configRoot,
        host: '127.0.0.1',
        port: 0,
      });

      try {
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });

        await page.goto(controlServer.url);
        await expect(page).toHaveTitle('Jenkins Control Dashboard');

        // Verify project card renders with Template Fixture Service
        await expect(page.locator('.project-card')).toHaveCount(1);
        await expect(page.locator('.project-card').getByRole('heading', { name: 'Template Fixture Service', exact: true })).toBeVisible();

        // Check for absence of cross-origin or CSP security violation errors
        const corsViolations = consoleErrors.filter(
          (err) => err.includes('Cross-Origin') || err.includes('Content Security Policy') || err.includes('CORS'),
        );
        expect(corsViolations).toEqual([]);
      } finally {
        await controlServer.close();
      }
    });
  });
});
