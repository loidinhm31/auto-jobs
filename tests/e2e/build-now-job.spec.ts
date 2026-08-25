import { expect, test } from '@playwright/test';

import { createAuthenticatedSession } from '../../src/jenkins/auth.js';
import { resolveJenkinsJob } from '../../src/jenkins/job.js';
import { UiBuildTrigger } from '../../src/jenkins/trigger.js';
import { configWithoutBuildNumber, phase3Config } from './fixtures.js';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('correlates one fresh Build Now fixture without accepting a stale build', async ({ browser }) => {
  test.skip(!process.env['JENKINS_JOB_PATH']?.includes('playwright-vulnerability-report-build-now'), 'Run with the Build Now fixture job.');
  test.setTimeout(180_000);
  const config = configWithoutBuildNumber(phase3Config());
  expect(config.jobPath).toContain('playwright-vulnerability-report-build-now');
  const session = await createAuthenticatedSession(browser, config);
  try {
    const job = await resolveJenkinsJob(session.page, config, session.deadline);
    expect(job.name).toBe('playwright-vulnerability-report-build-now');
    const result = await new UiBuildTrigger(session.page, config, job, session.deadline).trigger();
    expect(result).toMatchObject({ triggered: true, capability: 'build_now', triggerAttempts: 1 });
    expect(['queue_correlated', 'build_correlated']).toContain(result.state);
    expect(result.queueUrl ?? result.build?.url).toBeTruthy();
  } finally {
    await session.context.close();
  }
});
