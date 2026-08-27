import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { loadTemplateReportFixture } from '../../src/templates/template-report-fixture.js';
import { runFromTemplates } from '../../src/templates/template-report-runner.js';

test('generates a meaningful report from the checked-in Snyk and SonarQube templates', async () => {
  test.setTimeout(60_000);
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'template-report-regression-'));
  try {
    const result = await runFromTemplates({
      PROJECT_ID: 'template-report-fixture',
      PROJECT_NAME: 'Template Fixture Report',
      ARTIFACT_DIR: reportRoot,
      TEMPLATE_BUILD_NUMBER: '7',
      TEMPLATE_TIMEOUT_MS: '30000',
      TEMPLATE_POLL_INTERVAL_MS: '50',
      JENKINS_BASE_URL: 'http://127.0.0.1:9',
      JENKINS_JOB_PATH: 'private-job',
      JENKINS_USERNAME: 'private-user',
      JENKINS_PASSWORD: 'private-password',
    });
    const outcome = result.outcomes[0];
    expect(result.exitCode).toBe(0);
    expect(result.reportRoot).toBe(reportRoot);
    expect(outcome?.state, outcome?.warnings.join(' | ')).toBe('success');
    expect(outcome?.reportDirectory).toBeDefined();
    const reportDirectory = outcome?.reportDirectory as string;
    const data = JSON.parse(fs.readFileSync(path.join(reportDirectory, 'data.json'), 'utf8')) as {
      project: { id: string; name: string };
      jenkins: { status: string; buildNumber: number; trigger: { capability: string } };
      reports: {
        snyk: { state: string; summary?: { counts: Record<string, number> }; findings?: unknown[]; captures?: { screenshotPath?: string }[] };
        sonarqube: { state: string; facets?: { types: unknown[]; severities: unknown[] } };
      };
      warnings: string[];
    };
    expect(data.project).toEqual({ id: 'template-report-fixture', name: 'Template Fixture Report' });
    expect(data.jenkins).toMatchObject({
      baseUrl: 'https://templates.invalid/',
      status: 'TEMPLATE',
      buildNumber: 7,
      trigger: { capability: 'unknown' },
    });
    expect(data.reports.snyk).toMatchObject({
      state: 'found',
      summary: {
        counts: { critical: 2, high: 4, medium: 0, low: 0 },
        metadata: { dependencyCount: 160, dependencyPathCount: 6 },
      },
    });
    expect(data.reports.snyk.findings).toHaveLength(6);
    expect(data.reports.sonarqube).toMatchObject({ state: 'found' });
    expect(data.reports.sonarqube.facets?.types).toHaveLength(3);
    expect(data.reports.sonarqube.facets?.severities).toHaveLength(5);
    expect(data.warnings.join(' ')).not.toContain('summary/detail severity mismatch');
    expect(data.warnings.join(' ')).not.toContain('template-fixture-password');
    expect(JSON.stringify(data)).not.toContain('private-password');

    for (const screenshot of ['snyk-test-report.png', 'sonarqube-overall.png', 'sonarqube-issues.png']) {
      expect(fs.statSync(path.join(reportDirectory, screenshot)).size).toBeGreaterThan(0);
    }
    const html = fs.readFileSync(path.join(reportDirectory, 'index.html'), 'utf8');
    expect(html).toContain('Template Fixture Report');
    expect(html).toContain('Improper Certificate Validation');
    expect(html).toContain('Code Smell');
    expect(fs.existsSync(path.join(reportRoot, 'index.html'))).toBe(true);
  } finally {
    fs.rmSync(reportRoot, { recursive: true, force: true });
  }
});

test('keeps template capture routed when Firefox needs a separate safe context', async () => {
  test.setTimeout(60_000);
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'template-report-firefox-'));
  try {
    const result = await runFromTemplates({
      PROJECT_ID: 'template-report-firefox',
      PROJECT_NAME: 'Template Firefox Report',
      ARTIFACT_DIR: reportRoot,
      PLAYWRIGHT_BROWSER: 'firefox',
      TEMPLATE_TIMEOUT_MS: '30000',
      TEMPLATE_POLL_INTERVAL_MS: '50',
    });
    const outcome = result.outcomes[0];
    expect(result.exitCode).toBe(0);
    expect(outcome?.state).toBe('success');
    expect(outcome?.reportDirectory).toBeDefined();
    expect(fs.statSync(path.join(outcome?.reportDirectory as string, 'snyk-test-report.png')).size).toBeGreaterThan(0);
    const data = JSON.parse(fs.readFileSync(path.join(outcome?.reportDirectory as string, 'data.json'), 'utf8')) as {
      reports: { snyk: { findings?: unknown[]; captures?: { screenshotPath?: string }[] } };
    };
    expect(data.reports.snyk.findings).toHaveLength(6);
    expect(data.reports.snyk.captures?.some((capture) => capture.screenshotPath === 'snyk-test-report.png')).toBe(true);
  } finally {
    fs.rmSync(reportRoot, { recursive: true, force: true });
  }
});

test('rejects symlinked and oversized template sources before capture', async () => {
  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'template-report-symlink-'));
  const oversizedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'template-report-oversized-'));
  try {
    const sourceRoot = path.resolve('templates');
    fs.symlinkSync(sourceRoot, path.join(symlinkRoot, 'templates'), 'dir');
    await expect(loadTemplateReportFixture({ TEMPLATES_DIR: path.join(symlinkRoot, 'templates') }, 1)).rejects.toThrow(/real directory/iu);

    fs.mkdirSync(path.join(oversizedRoot, 'jenkins-template'), { recursive: true });
    fs.writeFileSync(path.join(oversizedRoot, 'jenkins-template', 'template.html'), Buffer.alloc(4 * 1_048_576 + 1, 0x41));
    await expect(loadTemplateReportFixture({ TEMPLATES_DIR: oversizedRoot }, 1)).rejects.toThrow(/regular file/iu);
  } finally {
    fs.rmSync(symlinkRoot, { recursive: true, force: true });
    fs.rmSync(oversizedRoot, { recursive: true, force: true });
  }
});
