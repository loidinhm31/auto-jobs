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
      page, project, deadline: new WorkflowDeadline(30_000), outputDirectory,
      reportUrl: `${fixture.origin}/jenkins/artifact/snyk-default.html`,
      summaryUrl: `${fixture.origin}/jenkins/artifact/snyk-summary.json`,
      readSummary: async (_page, summaryUrl) => ({ parsed: { counts: { critical: 0, high: 0, medium: 0, low: 0 }, warnings: [] }, url: summaryUrl }),
    });
    expect(result.source.state, result.source.warnings.join(' | ')).toBe('found');
    expect(result.source.captures[0]?.title).toBe('Static Snyk fixture report');
    expect(result.source.findings).toEqual([]);
  } finally {
    await fixture.close();
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
        page, project: sonarProject(), deadline: new WorkflowDeadline(30_000), outputDirectory, homeUrl: `${SONAR_ORIGIN}/dashboard?id=${encodeURIComponent(SONAR_PROJECT)}`,
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

test('captures SonarQube through login template redirect to Overall to Issues', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-login-e2e-'));
  const login = readFixture('sonarqube-template/template-login.html');
  const home = readFixture('sonarqube-template/template-home.html');
  const overall = readFixture('sonarqube-template/template-overall.html');
  const issues = readFixture('sonarqube-template/template-issues.html');

  await page.context().addInitScript(({ key }: { key: string }) => {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
      if (!(target instanceof HTMLElement) || target.textContent?.trim() !== 'Overall Code') return;
      event.preventDefault();
      window.location.assign(`/dashboard?id=${encodeURIComponent(key)}&codeScope=overall`);
    }, true);
  }, { key: SONAR_PROJECT });

  let authenticated = false;
  const sonarHandler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/sessions/new') {
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><meta http-equiv="refresh" content="0; url=${SONAR_ORIGIN}/dashboard?id=${encodeURIComponent(SONAR_PROJECT)}"><a href="${SONAR_ORIGIN}/dashboard?id=${encodeURIComponent(SONAR_PROJECT)}">Continue</a>`,
      });
      return;
    }
    if (url.pathname === '/sessions/new') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: login.replace(/<form\b([^>]*)>/iu, '<form$1 method="POST" action="/sessions/new">').replace(/<button([^>]*\btype=["']submit["'][^>]*?)\bdisabled(?:=""|="disabled")?([^>]*)>/giu, '<button$1$2>'),
      });
      return;
    }
    if (url.pathname === '/dashboard' && !authenticated) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: login.replace(/<form\b([^>]*)>/iu, '<form$1 method="POST" action="/sessions/new">').replace(/<button([^>]*\btype=["']submit["'][^>]*?)\bdisabled(?:=""|="disabled")?([^>]*)>/giu, '<button$1$2>'),
      });
      return;
    }
    if (url.pathname === '/project/issues') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: issues });
      return;
    }
    const body = url.searchParams.get('codeScope') === 'overall' ? overall : home;
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  };

  await page.context().route(`${SONAR_ORIGIN}/**`, sonarHandler);
  try {
    const result = await captureSonarqubeEvidence({
      page,
      project: sonarProject(),
      deadline: new WorkflowDeadline(30_000),
      outputDirectory,
      homeUrl: `${SONAR_ORIGIN}/dashboard?id=${encodeURIComponent(SONAR_PROJECT)}`,
      secrets: { username: 'fixture-user', password: 'fixture-password' },
    });
    expect(result.source.state, result.warnings.join(' | ')).toBe('found');
    expect(result.source.captures).toHaveLength(3);
    expect(result.screenshots).toEqual(['sonarqube-overall.png', 'sonarqube-issues.png']);
    expect(fs.existsSync(path.join(outputDirectory, 'sonarqube-overall.png'))).toBe(true);
    expect(fs.existsSync(path.join(outputDirectory, 'sonarqube-issues.png'))).toBe(true);
  } finally {
    await page.context().unroute(`${SONAR_ORIGIN}/**`, sonarHandler);
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

