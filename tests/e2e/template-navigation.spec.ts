import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { runFromTemplates } from '../../src/templates/template-report-runner.js';

const NAVIGATION_KEYS = [
  'jenkins-job',
  'snyk-report',
  'sonarqube-home',
  'sonarqube-overall',
  'sonarqube-issues',
] as const;

test('runs the production direct workflow against exact checked-in template routes', async ({}, testInfo) => {
  test.setTimeout(30_000);
  const reportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'template-navigation-'));
  const browserName = testInfo.project.name === 'webkit-template' ? 'webkit' : 'chromium';
  try {
    const result = await runFromTemplates({
      ...process.env,
      ARTIFACT_DIR: reportRoot,
      PROJECT_ID: 'template-navigation',
      PROJECT_NAME: 'Template navigation',
      PLAYWRIGHT_BROWSER: browserName,
      TEMPLATE_TIMEOUT_MS: '20000',
    });
    expect(result.exitCode).toBe(0);
    expect(result.manifests).toHaveLength(1);
    expect(result.aggregate.projects[0]?.state).toBe('success');
    const outcome = result.outcomes[0];
    expect(outcome?.state).toBe('success');
    expect(outcome?.reportDirectory).toBeDefined();
    const data = JSON.parse(await fs.readFile(path.join(outcome?.reportDirectory as string, 'data.json'), 'utf8')) as {
      navigation: Record<string, { state: string; liveUrl?: string }>;
      reports: {
        snyk: { state: string };
        sonarqube: { state: string };
      };
    };
    expect(Object.keys(data.navigation)).toEqual([...NAVIGATION_KEYS]);
    expect(Object.values(data.navigation).every((target) => target.state === 'found')).toBe(true);
    expect(data.reports.snyk.state).toBe('found');
    expect(data.reports.sonarqube.state).toBe('found');
  } finally {
    await fs.rm(reportRoot, { recursive: true, force: true });
  }
});
