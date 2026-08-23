import { expect, test } from '@playwright/test';

import {
  createAuthenticatedSession,
  loginToJenkins,
} from '../../src/jenkins/auth.js';
import {
  resolveJenkinsJob,
  selectExistingBuild,
  type JenkinsJobReference,
} from '../../src/jenkins/job.js';
import { JenkinsFlowError } from '../../src/jenkins/errors.js';
import { UiBuildTrigger } from '../../src/jenkins/trigger.js';
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
      const job = await resolveJenkinsJob(session.page, config);
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
      const job = await resolveJenkinsJob(session.page, config);
      const trigger = new UiBuildTrigger(session.page, config, job);
      const result = await trigger.trigger();

      expect(result).toEqual({
        triggered: false,
        capability: 'unsupported_parameterized',
        triggerAttempts: 0,
      });
    } finally {
      await session.context.close();
    }
  });
});

test('existing-build selection does not submit a trigger', async ({ page }) => {
  const config = phase3Config();
  const job: JenkinsJobReference = {
    name: 'playwright-vulnerability-report',
    path: config.jobPath,
    url: 'http://jenkins.test/job/playwright-vulnerability-report/',
  };
  const existingConfig = { ...config, baseUrl: 'http://jenkins.test' };
  existingConfig.buildNumber = 7;
  await page.setContent('<h1>playwright-vulnerability-report</h1>');

  const build = selectExistingBuild(job, existingConfig);
  expect(build).toEqual({
    number: 7,
    url: 'http://jenkins.test/job/playwright-vulnerability-report/7/',
  });
  await expect(page.locator('button')).toHaveCount(0);
});

test('submits one UI trigger and rejects a second trigger', async ({ page }) => {
  const config = configWithoutBuildNumber(phase3Config());
  const job: JenkinsJobReference = {
    name: 'playwright-vulnerability-report',
    path: config.jobPath,
    url: 'http://jenkins.test/job/playwright-vulnerability-report/',
    lastObservedBuildNumber: 2,
  };
  await page.setContent(
    '<main><button>Build Now</button><a href="http://jenkins.test/queue/item/31/">queued</a></main>',
  );

  const trigger = new UiBuildTrigger(page, config, job);
  const result = await trigger.trigger();
  expect(result.triggered).toBe(true);
  expect(result.queueUrl).toBe('http://jenkins.test/queue/item/31/');
  await expect(trigger.trigger()).rejects.toThrow(
    'already submitted for this run',
  );
});

test('supports a selector override and fails closed when the trigger is absent', async ({
  page,
}) => {
  const config = {
    ...configWithoutBuildNumber(phase3Config()),
    timeoutMs: 1_000,
  };
  config.selectors.trigger = {
    kind: 'testId',
    value: 'custom-trigger',
    required: true,
  };
  const job: JenkinsJobReference = {
    name: 'playwright-vulnerability-report',
    path: config.jobPath,
    url: 'http://jenkins.test/job/playwright-vulnerability-report/',
  };
  await page.setContent('<main><button>Build Now</button></main>');

  const trigger = new UiBuildTrigger(page, config, job);
  await expect(trigger.trigger()).rejects.toThrow(JenkinsFlowError);
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
  const failure = await loginToJenkins(page, expiredConfig).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(JenkinsFlowError);
  expect(String(failure)).toMatch(/Jenkins login failed/u);
  expect(String(failure)).not.toContain(config.password);
});
