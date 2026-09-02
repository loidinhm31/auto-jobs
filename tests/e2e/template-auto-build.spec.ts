import { expect, test } from '@playwright/test';

import { normalizeProjectConfigDocument } from '../../src/config/project-config-loader.js';
import { runAutoBuildProject } from '../../src/project/auto-build-runner.js';
import {
  installTemplateReportRoutes,
  loadTemplateReportFixture,
  templateProjectDocument,
} from '../../src/templates/template-report-fixture.js';

test.describe('template auto-build e2e workflow', () => {
  test('executes production auto-build workflow against offline template routes', async ({}, testInfo) => {
    test.setTimeout(45_000);
    const browserName = testInfo.project.name === 'webkit-template' ? 'webkit' : 'chromium';

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PROJECT_ID: 'template-auto-build',
      PROJECT_NAME: 'Template Auto Build',
      PLAYWRIGHT_BROWSER: browserName,
      PLAYWRIGHT_HEADLESS: 'true',
      TEMPLATE_TIMEOUT_MS: '25000',
    };

    const fixture = await loadTemplateReportFixture(env);
    const runtimeEnvironment: NodeJS.ProcessEnv = {
      ...env,
      TEMPLATE_FIXTURE_USERNAME: 'template-fixture-user',
      TEMPLATE_FIXTURE_PASSWORD: 'template-fixture-password',
    };

    const configDoc = templateProjectDocument(env, fixture, 'auto-build');
    const projects = normalizeProjectConfigDocument(configDoc, runtimeEnvironment);
    expect(projects).toHaveLength(1);
    const project = projects[0]!;
    expect(project.runType).toBe('auto-build');

    const requestLedger: Array<{ method: string; url: string }> = [];

    const outcome = await runAutoBuildProject(project, {
      runtimeEnvironment,
      configureContext: async (context) => {
        await installTemplateReportRoutes(context, fixture);
        context.on('request', (req) => {
          requestLedger.push({ method: req.method(), url: req.url() });
        });
      },
    });

    expect(outcome.state).toBe('submitted');
    expect(outcome.exitCode).toBe(0);
    expect(outcome.projectId).toBe('template-auto-build');
    expect(outcome.jobUrl).toBe(fixture.jobUrl);
    expect(outcome.buildPageUrl).toBe(fixture.buildPageUrl);
    expect([200, 303]).toContain(outcome.responseStatus);
    expect(outcome.submittedAt).toBeDefined();

    const buildPosts = requestLedger.filter(
      (r) => r.method === 'POST' && r.url === fixture.buildActionUrl,
    );
    expect(buildPosts).toHaveLength(1);

    const snykRequests = requestLedger.filter(
      (r) => r.url.includes('snyk') || r.url.includes('artifact/'),
    );
    expect(snykRequests).toHaveLength(0);

    const sonarRequests = requestLedger.filter(
      (r) => r.url.includes('sonar') || r.url.includes('dashboard') || r.url.includes('sessions'),
    );
    expect(sonarRequests).toHaveLength(0);

    const requestSequence = requestLedger.map((r) => `${r.method} ${r.url}`);
    expect(requestSequence).toContain(`GET ${fixture.loginUrl}`);
    expect(requestSequence).toContain(`POST ${fixture.loginActionUrl}`);
    expect(requestSequence).toContain(`GET ${fixture.jobUrl}`);
    expect(requestSequence).toContain(`GET ${fixture.buildPageUrl}`);
    expect(requestSequence).toContain(`POST ${fixture.buildActionUrl}`);
  });
});
