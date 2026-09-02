import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { normalizeProjectConfigDocument } from '../../src/config.js';
import type { NormalizedProjectConfig, ProjectConfigInput } from '../../src/config/config-types.js';
import { runAutoBuildProject } from '../../src/project/auto-build-runner.js';

function autoBuildProject(overrides: Partial<ProjectConfigInput> = {}): NormalizedProjectConfig {
  const targetId = overrides.id ?? 'service-a';
  const doc = normalizeProjectConfigDocument({
    schemaVersion: 1,
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        enabled: true,
        runType: 'auto-build',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/service-a/',
        timeoutMs: 5_000,
        browser: 'chromium',
        artifactDir: 'reports',
        credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' },
        sourceOrigins: {
          jenkins: ['https://jenkins.example'],
          snyk: ['https://snyk.example'],
          sonarqube: ['https://sonarqube.example'],
        },
        ...overrides,
      },
      {
        id: 'dummy-enabled',
        name: 'Dummy Enabled',
        enabled: true,
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/dummy/',
        credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' },
        sourceOrigins: {
          jenkins: ['https://jenkins.example'],
          snyk: ['https://snyk.example'],
          sonarqube: ['https://sonarqube.example'],
        },
      },
    ],
  });
  return doc.find((p) => p.id === targetId)!;
}
function mockBrowser(trackers: { contextClosed?: () => void; browserClosed?: () => void } = {}) {
  const context = {
    newPage: async () => ({} as Page),
    close: async () => {
      trackers.contextClosed?.();
    },
  } as unknown as BrowserContext;

  const browser = {
    newContext: async () => context,
    close: async () => {
      trackers.browserClosed?.();
    },
  } as unknown as Browser;

  return { browser, context };
}

const mockEnv = { A_USER: 'test-user', A_PASSWORD: 'super-secret-password' };

test('runs auto-build workflow successfully and returns submitted state with exit code 0', async () => {
  const { browser } = mockBrowser();
  const project = autoBuildProject();
  const outcome = await runAutoBuildProject(project, {
    runtimeEnvironment: mockEnv,
    launchBrowser: async () => browser,
    executeWorkflow: async () => ({
      state: 'submitted',
      jobUrl: project.jobUrl,
      buildPageUrl: `${project.jobUrl}build`,
      submittedAt: new Date().toISOString(),
      responseStatus: 302,
    }),
  });

  expect(outcome.state).toBe('submitted');
  expect(outcome.exitCode).toBe(0);
  expect(outcome.projectId).toBe('service-a');
  expect(outcome.projectName).toBe('Service A');
  expect(outcome.responseStatus).toBe(302);
});

test('handles rejected build state with exit code 1', async () => {
  const { browser } = mockBrowser();
  const project = autoBuildProject();
  const outcome = await runAutoBuildProject(project, {
    runtimeEnvironment: mockEnv,
    launchBrowser: async () => browser,
    executeWorkflow: async () => ({
      state: 'rejected',
      jobUrl: project.jobUrl,
      buildPageUrl: `${project.jobUrl}build`,
      submittedAt: new Date().toISOString(),
      responseStatus: 403,
    }),
  });

  expect(outcome.state).toBe('rejected');
  expect(outcome.exitCode).toBe(1);
  expect(outcome.responseStatus).toBe(403);
});

test('handles submission-unknown state with exit code 1', async () => {
  const { browser } = mockBrowser();
  const project = autoBuildProject();
  const outcome = await runAutoBuildProject(project, {
    runtimeEnvironment: mockEnv,
    launchBrowser: async () => browser,
    executeWorkflow: async () => ({
      state: 'submission-unknown',
      jobUrl: project.jobUrl,
      buildPageUrl: `${project.jobUrl}build`,
      submittedAt: new Date().toISOString(),
    }),
  });

  expect(outcome.state).toBe('submission-unknown');
  expect(outcome.exitCode).toBe(1);
});

test('fails closed when project is disabled or configured for report', async () => {
  const { browser } = mockBrowser();
  const disabled = autoBuildProject({ enabled: false });
  const outcomeDisabled = await runAutoBuildProject(disabled, {
    runtimeEnvironment: mockEnv,
    launchBrowser: async () => browser,
  });
  expect(outcomeDisabled.state).toBe('failed-before-submit');
  expect(outcomeDisabled.exitCode).toBe(1);
  expect(outcomeDisabled.error).toContain('disabled');

  const reportProject = autoBuildProject({ runType: 'report' });
  const outcomeReport = await runAutoBuildProject(reportProject, {
    runtimeEnvironment: mockEnv,
    launchBrowser: async () => browser,
  });
  expect(outcomeReport.state).toBe('failed-before-submit');
  expect(outcomeReport.exitCode).toBe(1);
  expect(outcomeReport.error).toContain('not configured for auto-build');
});

test('cleans up context and browser resources even when workflow throws', async () => {
  let contextClosed = false;
  let browserClosed = false;
  const { browser } = mockBrowser({
    contextClosed: () => { contextClosed = true; },
    browserClosed: () => { browserClosed = true; },
  });

  const project = autoBuildProject();
  const outcome = await runAutoBuildProject(project, {
    runtimeEnvironment: mockEnv,
    launchBrowser: async () => browser,
    executeWorkflow: async () => {
      throw new Error('Failure while opening job with super-secret-password');
    },
  });

  expect(outcome.state).toBe('failed-before-submit');
  expect(outcome.exitCode).toBe(1);
  expect(outcome.error).not.toContain('super-secret-password');
  expect(contextClosed).toBe(true);
  expect(browserClosed).toBe(true);
});
