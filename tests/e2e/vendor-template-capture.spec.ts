import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { captureSonarqubeEvidence } from '../../src/reports/sonarqube/sonarqube-capture.js';
import { captureSnykEvidence } from '../../src/reports/snyk/snyk-capture.js';
import type { ScriptSafePage } from '../../src/reports/snyk/snyk-capture-support.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

test.use({ trace: 'on-first-retry', screenshot: 'off', video: 'off' });

const JENKINS_ORIGIN = 'https://jenkins.example';
const SONAR_ORIGIN = 'https://sonarqube.example-domain.com';
const SONAR_PROJECT = 'com.example-domain.example-package:com.example-domain.example-package.service';

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'templates', filename), 'utf8');
}

function snykProject(): NormalizedProjectConfig {
  return {
    id: 'service-a', name: 'Service A', enabled: true, schemaVersion: 1,
    baseUrl: `${JENKINS_ORIGIN}/jenkins`, jobPath: 'service-a', jobUrl: `${JENKINS_ORIGIN}/jenkins/job/service-a/`,
    loginPath: '/login', triggerMode: 'ui', timeoutMs: 30_000, pollIntervalMs: 50, browser: 'chromium', artifactDir: 'reports',
    credentialVariables: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    sourceOrigins: { jenkins: JENKINS_ORIGIN, snyk: [JENKINS_ORIGIN], sonarqube: [] },
    sources: { snyk: { allowedOrigins: [JENKINS_ORIGIN] }, sonarqube: { allowedOrigins: [] } },
    selectors: { snykReport: { kind: 'testId', value: 'snyk-report', required: false } },
  } as unknown as NormalizedProjectConfig;
}

function sonarProject(): NormalizedProjectConfig {
  return {
    id: 'service-a', name: 'com.example-domain.example-package.service', enabled: true, schemaVersion: 1,
    baseUrl: `${JENKINS_ORIGIN}/jenkins`, jobPath: 'service-a', jobUrl: `${JENKINS_ORIGIN}/jenkins/job/service-a/`,
    loginPath: '/login', triggerMode: 'ui', timeoutMs: 30_000, pollIntervalMs: 50, browser: 'chromium', artifactDir: 'reports',
    credentialVariables: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    sourceOrigins: { jenkins: JENKINS_ORIGIN, snyk: [], sonarqube: [SONAR_ORIGIN] },
    sources: { snyk: { allowedOrigins: [] }, sonarqube: { allowedOrigins: [SONAR_ORIGIN], projectId: SONAR_PROJECT } },
    selectors: {},
  } as unknown as NormalizedProjectConfig;
}

test('captures Snyk detail, summary-only, malformed, missing, and blocked redirect states', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-snyk-e2e-'));
  const report = readFixture('snyk-template/template.html');
  let mode = 'detail';
  const fixtureRoute = async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/job/service-a/')) {
      const link = mode === 'missing' ? '' : `<a href="${JENKINS_ORIGIN}/jenkins/artifact/snyk-${mode}.html">Snyk test report</a>`;
      await route.fulfill({ status: 200, contentType: 'text/html', body: link });
    } else if (url.pathname.endsWith('/artifact/snyk-detail.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: report });
    } else if (url.pathname.endsWith('/artifact/snyk-summary.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<main><h1>Snyk test report</h1><div class="severity-count critical">0</div><div class="severity-count high">2</div><div class="severity-count medium">0</div><div class="severity-count low">0</div></main>' });
    } else if (url.pathname.endsWith('/artifact/snyk-malformed.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Malformed publisher page</h1>' });
    } else if (url.pathname.endsWith('/artifact/snyk-redirect.html')) {
      await route.fulfill({ status: 302, headers: { location: 'https://evil.example/report.html?sessionid=fixture-secret' } });
    } else {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  };
  await page.route(`${JENKINS_ORIGIN}/**`, fixtureRoute);
  const openFixtureSafePage = async (sourcePage: Page): Promise<ScriptSafePage> => {
    const browser = sourcePage.context().browser();
    if (browser === null) throw new Error('fixture browser is unavailable');
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await sourcePage.context().storageState(),
      viewport: { width: 1_440, height: 900 },
    });
    await context.route(`${JENKINS_ORIGIN}/**`, fixtureRoute);
    const safePage = await context.newPage();
    return { page: safePage, close: () => context.close() };
  };
  try {
    const project = snykProject();
    await page.goto(`${JENKINS_ORIGIN}/jenkins/job/service-a/`);
    let result = await captureSnykEvidence({ page, project, deadline: new WorkflowDeadline(30_000), outputDirectory, terminalBuildUrl: page.url(), openSafePage: openFixtureSafePage });
    expect(result.source.state, result.source.warnings.join(' | ')).toBe('found');
    expect(result.source.findings?.length).toBeGreaterThan(0);
    expect(result.source.captures[0]?.screenshotPath).toBe('snyk-test-report.png');
    expect(fs.existsSync(path.join(outputDirectory, 'snyk-test-report.png'))).toBe(true);

    mode = 'summary';
    await page.goto(`${JENKINS_ORIGIN}/jenkins/job/service-a/`);
    result = await captureSnykEvidence({ page, project, deadline: new WorkflowDeadline(30_000), outputDirectory, terminalBuildUrl: page.url(), openSafePage: openFixtureSafePage });
    expect(result.source.state).toBe('found');
    expect(result.source.findings).toEqual([]);
    expect(result.source.summary?.counts).toEqual({ critical: 0, high: 2, medium: 0, low: 0 });

    mode = 'malformed';
    await page.goto(`${JENKINS_ORIGIN}/jenkins/job/service-a/`);
    result = await captureSnykEvidence({ page, project, deadline: new WorkflowDeadline(3_000), outputDirectory, terminalBuildUrl: page.url(), openSafePage: openFixtureSafePage });
    expect(result.source.state).toBe('incomplete');

    mode = 'missing';
    await page.goto(`${JENKINS_ORIGIN}/jenkins/job/service-a/`);
    result = await captureSnykEvidence({ page, project, deadline: new WorkflowDeadline(30_000), outputDirectory, terminalBuildUrl: page.url(), openSafePage: openFixtureSafePage });
    expect(result.source.state).toBe('not_found');

    mode = 'redirect';
    await page.goto(`${JENKINS_ORIGIN}/jenkins/job/service-a/`);
    result = await captureSnykEvidence({ page, project, deadline: new WorkflowDeadline(3_000), outputDirectory, terminalBuildUrl: page.url(), openSafePage: openFixtureSafePage });
    expect(result.source.state).toBe('incomplete');
    expect(result.warnings.join(' ')).not.toContain('fixture-secret');
  } finally {
    await page.unroute(`${JENKINS_ORIGIN}/**`, fixtureRoute);
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('captures SonarQube Home to Overall to Issues and survives generated facet attributes changing', async ({ page }) => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-sonar-e2e-'));
  const home = readFixture('sonarqube-template/template-home.html');
  const overall = readFixture('sonarqube-template/template-overall.html');
  const issues = readFixture('sonarqube-template/template-issues.html');
  let mutated = false;
  await page.context().addInitScript(({ key }: { key: string }) => {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
      if (!(target instanceof HTMLElement) || target.textContent?.trim() !== 'Overall Code') return;
      event.preventDefault();
      window.location.assign(`/dashboard?id=${encodeURIComponent(key)}&codeScope=overall`);
    }, true);
  }, { key: SONAR_PROJECT });
  const jenkinsHandler = async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: `<a href="${SONAR_ORIGIN}/dashboard?id=${encodeURIComponent(SONAR_PROJECT)}">SonarQube Quality Gate</a>` });
  };
  const sonarHandler = async (route: Route) => {
    const url = new URL(route.request().url());
    const issueHtml = mutated
      ? issues.replaceAll('data-property="types"', 'data-property="generated-types"').replaceAll('data-property="severities"', 'data-property="generated-severities"')
      : issues;
    const body = url.pathname === '/project/issues' ? issueHtml : url.searchParams.get('codeScope') === 'overall' ? overall : home;
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  };
  await page.context().route(`${JENKINS_ORIGIN}/**`, jenkinsHandler);
  await page.context().route(`${SONAR_ORIGIN}/**`, sonarHandler);
  try {
    for (const isMutated of [false, true]) {
      mutated = isMutated;
      const outputDirectory = path.join(outputRoot, isMutated ? 'mutated' : 'semantic');
      fs.mkdirSync(outputDirectory);
      await page.goto(`${JENKINS_ORIGIN}/jenkins/job/service-a/`);
      const result = await captureSonarqubeEvidence({
        page, project: sonarProject(), deadline: new WorkflowDeadline(30_000), outputDirectory, terminalBuildUrl: page.url(),
      });
      if (result.source.state !== 'found') {
        throw new Error(`Sonar fixture capture incomplete: ${result.source.warnings.join(' | ')}`);
      }
      expect(result.source.captures).toHaveLength(3);
      expect(result.source.facets).toEqual({
        types: [{ label: 'Bug', count: 1 }, { label: 'Vulnerability', count: 0 }, { label: 'Code Smell', count: 526 }],
        severities: [
          { label: 'Blocker', count: 23 }, { label: 'Critical', count: 8 }, { label: 'Major', count: 165 },
          { label: 'Minor', count: 323 }, { label: 'Info', count: 8 },
        ],
      });
      expect(result.source).not.toHaveProperty('measures');
      expect(result.screenshots).toEqual(['sonarqube-overall.png', 'sonarqube-issues.png']);
      expect(fs.existsSync(path.join(outputDirectory, 'sonarqube-overall.png'))).toBe(true);
      expect(fs.existsSync(path.join(outputDirectory, 'sonarqube-issues.png'))).toBe(true);
    }
  } finally {
    await page.context().unroute(`${JENKINS_ORIGIN}/**`, jenkinsHandler);
    await page.context().unroute(`${SONAR_ORIGIN}/**`, sonarHandler);
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});
