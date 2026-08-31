import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';
import type { AddressInfo } from 'node:net';

import { normalizeProjectConfigDocument } from '../../src/config.js';
import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { captureSonarqubeEvidence } from '../../src/reports/sonarqube/sonarqube-capture.js';
import { captureSnykEvidence } from '../../src/reports/snyk/snyk-capture.js';
import { screenshotReport, SNYK_VIEWPORT, type ScriptSafePage } from '../../src/reports/snyk/snyk-capture-support.js';
import { defaultCapture } from '../../src/project/project-capture.js';
import type { ProjectWorkflowResult } from '../../src/project/project-workflow.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

test.use({ trace: 'on-first-retry', screenshot: 'off', video: 'off' });

const JENKINS_ORIGIN = 'https://jenkins.example';
const SONAR_ORIGIN = 'https://sonarqube.example-domain.com';
const SONAR_PROJECT = 'com.example-domain.example-package:com.example-domain.example-package.service';

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'templates', filename), 'utf8');
}

test('captures the first viewport after the source page has been scrolled', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-first-viewport-'));
  try {
    await page.setViewportSize(SNYK_VIEWPORT);
    await page.setContent(readFixture('snyk-template/template.html'));
    await page.evaluate(() => window.scrollTo(0, 1_200));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await screenshotReport(page, outputDirectory, new WorkflowDeadline(30_000));

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const screenshot = fs.readFileSync(path.join(outputDirectory, 'snyk-test-report.png'));
    expect({ width: screenshot.readUInt32BE(16), height: screenshot.readUInt32BE(20) })
      .toEqual(SNYK_VIEWPORT);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

function snykProject(): NormalizedProjectConfig {
  const [project] = normalizeProjectConfigDocument({
    schemaVersion: 1,
    projects: [{
      id: 'service-a',
      name: 'Service A',
      loginUrl: `${JENKINS_ORIGIN}/jenkins/login`,
      jobUrl: `${JENKINS_ORIGIN}/jenkins/job/service-a/`,
      sourceOrigins: { jenkins: [JENKINS_ORIGIN], snyk: [JENKINS_ORIGIN], sonarqube: [] },
      snyk: { allowedOrigins: [JENKINS_ORIGIN] },
    }],
  });
  if (project === undefined) throw new Error('Snyk test project was not normalized');
  return project;
}

function sonarProject(): NormalizedProjectConfig {
  const [project] = normalizeProjectConfigDocument({
    schemaVersion: 1,
    projects: [{
      id: 'service-a',
      name: 'com.example-domain.example-package.service',
      loginUrl: `${JENKINS_ORIGIN}/jenkins/login`,
      jobUrl: `${JENKINS_ORIGIN}/jenkins/job/service-a/`,
      sourceOrigins: { jenkins: [JENKINS_ORIGIN], snyk: [], sonarqube: [SONAR_ORIGIN] },
      sonarqube: { allowedOrigins: [SONAR_ORIGIN], projectId: SONAR_PROJECT },
    }],
  });
  if (project === undefined) throw new Error('SonarQube test project was not normalized');
  return project;
}

async function startDefaultSafePageFixture(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://fixture').pathname;
    const body = pathname.endsWith('/job/service-a/')
      ? '<a href="/jenkins/artifact/snyk-default.html">Snyk test report</a>'
      : pathname.endsWith('/artifact/snyk-default.html')
        ? `<!doctype html><html><head><title>Static Snyk fixture report</title></head><body><main>
          <h1>Snyk test report</h1>
          <div class="severity-count critical">0</div><div class="severity-count high">0</div>
          <div class="severity-count medium">0</div><div class="severity-count low">0</div>
          <script>document.title = 'SCRIPT_EXECUTED'; document.querySelector('h1').textContent = 'SCRIPT_EXECUTED';</script>
        </main></body></html>`
        : undefined;
    if (body === undefined) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('captures Snyk through the default safe page without executing report scripts', async ({ page }) => {
  const fixture = await startDefaultSafePageFixture();
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-default-safe-page-'));
  try {
    const project = {
      ...snykProject(),
      loginUrl: `${fixture.origin}/jenkins/login`,
      jobUrl: `${fixture.origin}/jenkins/job/service-a/`,
      sourceOrigins: { jenkins: fixture.origin, snyk: [fixture.origin], sonarqube: [] },
      sources: { snyk: { allowedOrigins: [fixture.origin] }, sonarqube: { allowedOrigins: [] } },
    } as unknown as NormalizedProjectConfig;
    await page.goto(`${fixture.origin}/jenkins/job/service-a/`);
    await expect(page.getByRole('link', { name: 'Snyk test report' })).toBeVisible();

    const result = await captureSnykEvidence({
      page, project, deadline: new WorkflowDeadline(30_000), outputDirectory, terminalBuildUrl: page.url(),
    });
    expect(result.source.state, result.source.warnings.join(' | ')).toBe('found');
    expect(result.source.captures[0]?.title).toBe('Static Snyk fixture report');
    expect(result.source.findings).toEqual([]);
  } finally {
    await fixture.close();
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

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
    const screenshot = fs.readFileSync(path.join(outputDirectory, 'snyk-test-report.png'));
    expect({ width: screenshot.readUInt32BE(16), height: screenshot.readUInt32BE(20) })
      .toEqual({ width: 1_440, height: 900 });

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

test('refreshes an exact terminal build until archived publisher links are available', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-link-settle-'));
  const snykHtml = fs.readFileSync(path.resolve('docker/jenkins/fixtures/reports/snyk/index.html'), 'utf8');
  const sonarRoot = path.resolve('docker/jenkins/fixtures/reports/sonarqube');
  const sonarHome = fs.readFileSync(path.join(sonarRoot, 'index.html'), 'utf8');
  const sonarOverall = fs.readFileSync(path.join(sonarRoot, 'overall.html'), 'utf8');
  const sonarIssues = fs.readFileSync(path.join(sonarRoot, 'issues.html'), 'utf8');
  const origin = JENKINS_ORIGIN;
  let terminalLoads = 0;
  const terminalUrl = `${origin}/jenkins/job/service-a/42/`;
  const project = {
    ...snykProject(),
    sourceOrigins: { jenkins: origin, snyk: [origin], sonarqube: [origin] },
    sources: {
      snyk: { allowedOrigins: [origin], projectId: 'service-a' },
      sonarqube: { allowedOrigins: [origin], projectId: 'service-a' },
    },
  } as unknown as NormalizedProjectConfig;
  const workflow: ProjectWorkflowResult = {
    terminal: {
      build: { number: 42, url: terminalUrl }, status: 'SUCCESS', observedAt: new Date().toISOString(),
      observationErrors: [], reloadCount: 0,
    },
    trigger: { capability: 'existing_build', triggerAttempts: 0, build: { number: 42, url: terminalUrl }, warnings: [] },
  };
  await page.context().route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/jenkins/job/service-a/42/') {
      terminalLoads += 1;
      const body = terminalLoads === 1
        ? `<a style="display:none" href="${origin}/jenkins/job/service-a/42/artifact/reports/snyk/index.html">hidden stale Snyk</a>`
        : terminalLoads === 2
        ? `<a href="${origin}/jenkins/job/service-a/42/artifact/reports/snyk/index.html">snyk/index.html</a>` : `
        <a href="${origin}/jenkins/job/service-a/42/artifact/reports/snyk/index.html">snyk/index.html</a>
        <a href="${origin}/jenkins/job/service-a/42/artifact/reports/sonarqube/index.html">sonarqube/index.html</a>`;
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    } else if (url.pathname.endsWith('/artifact/reports/snyk/index.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: snykHtml });
    } else if (url.pathname.endsWith('/artifact/reports/sonarqube/index.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: sonarHome });
    } else if (url.pathname.endsWith('/artifact/reports/sonarqube/overall.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: sonarOverall });
    } else if (url.pathname.endsWith('/artifact/reports/sonarqube/issues.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: sonarIssues });
    } else {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  try {
    await page.goto(terminalUrl);
    const result = await defaultCapture({
      page, project, workflow, deadline: new WorkflowDeadline(30_000), outputDirectory,
    });
    expect(terminalLoads).toBeGreaterThan(2);
    expect(result.reports.snyk.state).toBe('found');
    expect(result.reports.sonarqube.state).toBe('found');
    expect(result.artifacts?.screenshots).toEqual(['snyk-test-report.png', 'sonarqube-overall.png', 'sonarqube-issues.png']);
  } finally {
    await page.context().unroute(`${origin}/**`);
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
