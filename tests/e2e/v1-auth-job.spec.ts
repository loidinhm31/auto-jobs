import { expect, test } from '@playwright/test';

import {
  createAuthenticatedSession,
  loginToJenkins,
} from '../../src/jenkins/auth.js';
import {
  resolveJenkinsJob,
} from '../../src/jenkins/job.js';
import { JenkinsFlowError } from '../../src/jenkins/errors.js';
import { UiBuildTrigger } from '../../src/jenkins/trigger.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';
import { configWithoutBuildNumber, phase3Config } from './fixtures.js';

test.describe.configure({ mode: 'serial' });
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('credential-bearing Jenkins flows', () => {
  test('logs in with an ephemeral context and verifies the configured Pipeline job', async ({
    browser,
  }) => {
    const config = phase3Config();
    const session = await createAuthenticatedSession(browser, config);
    try {
      const job = await resolveJenkinsJob(session.page, config, session.deadline);
      expect(job.name).toBe('playwright-vulnerability-report');
      expect(job.url).toContain('/job/playwright-vulnerability-report/');
    } finally {
      await session.context.close();
    }
  });

  test('rejects the configured parameterized Pipeline before interaction', async ({
    browser,
  }) => {
    const config = configWithoutBuildNumber(phase3Config());
    const session = await createAuthenticatedSession(browser, config);
    try {
      const job = await resolveJenkinsJob(session.page, config, session.deadline);
      const trigger = new UiBuildTrigger(session.page, config, job, session.deadline);
      const result = await trigger.trigger();

      expect(result).toMatchObject({
        triggered: false,
        capability: 'unsupported_parameterized',
        triggerAttempts: 0,
        state: 'unsupported_parameterized',
      });
    } finally {
      await session.context.close();
    }
  });
});

test('reports an expired session without exposing credentials', async ({ page }) => {
  const config = phase3Config();
  const expiredConfig = { ...config, timeoutMs: 1_000 };
  await page.route(`${config.baseUrl}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<h1>Sign in to Jenkins</h1>',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `
        <form method="post" action="${config.baseUrl}/j_spring_security_check">
          <label>Username<input name="j_username" /></label>
          <label>Password<input name="j_password" type="password" /></label>
          <button type="submit">Sign in</button>
        </form>
      `,
    });
  });
  const failure = await loginToJenkins(
    page,
    expiredConfig,
    new WorkflowDeadline(expiredConfig.timeoutMs),
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(JenkinsFlowError);
  expect(String(failure)).toMatch(/Jenkins login failed/u);
  expect(String(failure)).not.toContain(config.password);
});
