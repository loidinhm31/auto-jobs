import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { captureSonarqubeEvidence } from '../../src/reports/sonarqube/sonarqube-capture.js';
import { captureIssuesStep } from '../../src/reports/sonarqube/sonarqube-capture-steps.js';
import {
  facetCandidates,
  facetCandidatesWithStatus,
  facetLocators,
  firstAvailable,
  issuesControlCandidates,
} from '../../src/reports/sonarqube/sonarqube-locators.js';
import { screenshotFacetRange } from '../../src/reports/sonarqube/sonarqube-capture-support.js';
import { normalizeSonarIssueFacets } from '../../src/reports/sonarqube/sonarqube-issue-facets.js';
import { classifySonarLinks } from '../../src/reports/source-link-classifier.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

function project(overrides: Record<string, unknown> = {}): NormalizedProjectConfig {
  return {
    id: 'service-a', name: 'Service A', enabled: true, schemaVersion: 1,
    baseUrl: 'https://jenkins.example', jobPath: 'service-a', jobUrl: 'https://jenkins.example/job/service-a/',
    loginPath: '/login', triggerMode: 'ui', timeoutMs: 30_000, pollIntervalMs: 50,
    browser: 'chromium', artifactDir: 'reports',
    credentialVariables: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: [], sonarqube: ['https://sonar.example'] },
    sources: {
      snyk: { allowedOrigins: [] },
      sonarqube: { allowedOrigins: ['https://sonar.example'], projectId: 'service-a' },
    },
    selectors: {} as NormalizedProjectConfig['selectors'],
    ...overrides,
  } as NormalizedProjectConfig;
}

test('classifies one allowlisted Sonar dashboard and rejects ambiguity', () => {
  const configured = project();
  const result = classifySonarLinks([
    { href: 'https://sonar.example/dashboard?id=service-a', text: 'SonarQube Quality Gate' },
    { href: 'https://evil.example/dashboard?id=service-a', text: 'SonarQube Quality Gate' },
  ], configured);
  expect(result.home?.href).toBe('https://sonar.example/dashboard?id=service-a');
  expect(result.warnings).toContain('an observed SonarQube home link was outside the configured origins');

  const ambiguous = classifySonarLinks([
    { href: 'https://sonar.example/dashboard?id=service-a', text: 'SonarQube' },
    { href: 'https://sonar.example/dashboard?id=other', text: 'SonarQube' },
  ], project({ sources: { snyk: { allowedOrigins: [] }, sonarqube: { allowedOrigins: ['https://sonar.example'] } } }));
  expect(ambiguous.home).toBeUndefined();
  expect(ambiguous.warnings).toContain('ambiguous SonarQube home candidates were rejected');
});

test('normalizes only bounded Type and Severity values', () => {
  const result = normalizeSonarIssueFacets({
    types: [{ label: ' Bug ', count: '1' }, { label: 'bug', count: 2 }, { label: 'Rule', count: -1 }],
    severities: [{ label: 'Critical', count: 4 }, { label: '', count: 1 }],
  });
  expect(result.facets).toEqual({
    types: [{ label: 'Bug', count: 1 }],
    severities: [{ label: 'Critical', count: 4 }],
  });
  expect(result.warnings.join(' ')).toMatch(/duplicate|invalid/u);
});

test('captures home to Overall to Issues through visible actions and scoped facets', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-capture-'));
  const home = `<!doctype html><title>Service A Overview</title><nav aria-label="Project"><a href="https://sonar.example/dashboard?id=service-a">Overview</a><a href="https://sonar.example/project/issues?id=service-a">Issues</a></nav><h1>Overview</h1><a role="link" aria-label="service-a">service-a</a><button role="tab" aria-selected="false">Overall Code</button><script>document.querySelector('[role=tab]').addEventListener('click', () => { location.href = 'https://sonar.example/dashboard?id=service-a&codeScope=overall'; });</script>`;
  const overall = '<!doctype html><title>Service A Overall</title><a href="https://sonar.example/dashboard?id=service-a">service-a</a><h1>Overview</h1><div id="tabpanel-overall">overall evidence</div><a href="https://sonar.example/project/issues?issueStatuses=OPEN&id=service-a">Issues</a>';
  const issues = '<!doctype html><title>Service A Issues</title><a href="https://sonar.example/dashboard?id=service-a">service-a</a><h1>Issues</h1><nav data-testid="issues-nav-bar" aria-label="Filters"><div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" aria-label="Bug 1"><span class="name">Bug</span><span class="stat">1</span></button></div></div><div data-component="facet-box" data-property="severities"><button aria-label="Severity" aria-expanded="true"></button><div role="group"><button role="checkbox" title="Critical"><span class="name">Critical</span><span class="stat">4</span></button></div></div></nav>';
  try {
    await page.context().route('https://jenkins.example/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<a href="https://sonar.example/dashboard?id=service-a">SonarQube Quality Gate</a>' });
    });
    await page.context().route('https://sonar.example/**', async (route) => {
      const url = new URL(route.request().url());
      const body = url.pathname === '/project/issues' ? issues : url.searchParams.get('codeScope') === 'overall' ? overall : home;
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    });
    await page.goto('https://jenkins.example/job/service-a/');
    const result = await captureSonarqubeEvidence({
      page, project: project(), deadline: new WorkflowDeadline(30_000), outputDirectory,
      terminalBuildUrl: 'https://jenkins.example/job/service-a/',
    });
    expect(result.source.state).toBe('found');
    expect(result.source.facets).toEqual({ types: [{ label: 'Bug', count: 1 }], severities: [{ label: 'Critical', count: 4 }] });
    expect(result.source.captures.map((capture) => capture.url)).toEqual([
      'https://sonar.example/dashboard?id=service-a',
      'https://sonar.example/dashboard?id=service-a&codeScope=overall',
      'https://sonar.example/project/issues?issueStatuses=OPEN&id=service-a',
    ]);
    expect(result.screenshots).toEqual(['sonarqube-overall.png', 'sonarqube-issues.png']);
    expect(fs.existsSync(path.join(outputDirectory, 'sonarqube-overall.png'))).toBe(true);
    expect(fs.existsSync(path.join(outputDirectory, 'sonarqube-issues.png'))).toBe(true);
  } finally {
    await page.context().unroute('https://jenkins.example/**');
    await page.context().unroute('https://sonar.example/**');
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('captures the saved Sonar templates through the complete Home to Overall to Issues journey', async ({ page }) => {
  const projectKey = 'com.example-domain.example-package:com.example-domain.example-package.service';
  const displayName = 'com.example-domain.example-package.service';
  const sonarOrigin = 'https://sonarqube.example-domain.com';
  const configured = project({
    name: displayName,
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: [], sonarqube: [sonarOrigin] },
    sources: { snyk: { allowedOrigins: [] }, sonarqube: { allowedOrigins: [sonarOrigin], projectId: projectKey } },
  });
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-saved-journey-'));
  const home = fs.readFileSync(path.join(process.cwd(), 'templates/sonarqube-template/template-home.html'), 'utf8');
  const overall = fs.readFileSync(path.join(process.cwd(), 'templates/sonarqube-template/template-overall.html'), 'utf8');
  const issues = fs.readFileSync(path.join(process.cwd(), 'templates/sonarqube-template/template-issues.html'), 'utf8');
  await page.context().addInitScript(({ key }: { key: string }) => {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
      if (!(target instanceof HTMLElement) || target.textContent?.trim() !== 'Overall Code') return;
      event.preventDefault();
      window.location.assign(`/dashboard?id=${encodeURIComponent(key)}&codeScope=overall`);
    }, true);
  }, { key: projectKey });
  await page.context().route('https://jenkins.example/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: `<a href="${sonarOrigin}/dashboard?id=${encodeURIComponent(projectKey)}">SonarQube Quality Gate</a>` });
  });
  await page.context().route(`${sonarOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname === '/project/issues' ? issues : url.searchParams.get('codeScope') === 'overall' ? overall : home;
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  try {
    await page.goto('https://jenkins.example/job/service-a/');
    const result = await captureSonarqubeEvidence({
      page,
      project: configured,
      deadline: new WorkflowDeadline(60_000),
      outputDirectory,
      terminalBuildUrl: 'https://jenkins.example/job/service-a/',
    });
    expect(result.source.state).toBe('found');
    expect(result.navigation['sonarqube-home'].state).toBe('found');
    expect(result.navigation['sonarqube-overall'].state).toBe('found');
    expect(result.navigation['sonarqube-issues'].state).toBe('found');
    expect(result.source.facets?.types.length).toBeGreaterThan(0);
    expect(result.source.facets?.severities.length).toBeGreaterThan(0);
    expect(result.screenshots).toEqual(['sonarqube-overall.png', 'sonarqube-issues.png']);
  } finally {
    await page.context().unroute('https://jenkins.example/**');
    await page.context().unroute(`${sonarOrigin}/**`);
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('uses the scoped generated-class fallback without reading unrelated wrappers', async ({ page }) => {
  await page.setContent('<div class="css-1l8tlcx"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" aria-label="Bug 2"><span class="name">Bug</span><span class="stat">2</span></button></div></div><div class="css-1l8tlcx"><button aria-label="Tag"></button><div role="group"><button role="checkbox" aria-label="secret row"><span class="name">Wrong</span><span class="stat">99</span></button></div></div>');
  const facet = await facetLocators(page, 'types', 'Type');
  expect(facet.strategy).toContain('scoped-generated-fallback');
  expect(await facetCandidates(facet, 'types')).toEqual([{ label: 'Bug', count: '2' }]);
});

test('keeps the project Issues action ahead of an unrelated global Issues link', async ({ page }) => {
  await page.setContent('<a href="https://sonar.example/project/issues?id=other">Issues</a><nav aria-label="Project"><a href="https://sonar.example/project/issues?issueStatuses=OPEN&id=service-a">Issues</a></nav>');
  const control = await firstAvailable(await issuesControlCandidates(page, 'service-a'));
  expect(await control.locator.getAttribute('href')).toContain('id=service-a');
  expect(control.strategy).toContain('Project');
});

test('rejects a wrong-project link inside the project navigation before fallback selection', async ({ page }) => {
  await page.setContent('<nav aria-label="Project"><a href="https://sonar.example/project/issues?id=other">Issues</a></nav><a href="https://sonar.example/project/issues?issueStatuses=OPEN&id=service-a">Issues</a>');
  const control = await firstAvailable(await issuesControlCandidates(page, 'service-a'));
  expect(await control.locator.getAttribute('href')).toContain('id=service-a');
});

test('matches the saved Sonar template and its generated-class fallback ancestry', async ({ page }) => {
  const fixture = fs.readFileSync(path.join(process.cwd(), 'templates/sonarqube-template/template-issues.html'), 'utf8');
  await page.setContent(fixture);
  const semantic = await facetLocators(page, 'types', 'Type');
  const severity = await facetLocators(page, 'severities', 'Severity');
  expect(await semantic.panel.count()).toBe(1);
  expect((await facetCandidates(semantic, 'types')).length).toBeGreaterThan(0);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-template-'));
  try {
    const screenshot = await screenshotFacetRange(page, semantic.container, severity.container, outputDirectory, 'facets.png', new WorkflowDeadline(30_000));
    expect(screenshot.screenshotPath).toBe('facets.png');
    expect(fs.existsSync(path.join(outputDirectory, 'facets.png'))).toBe(true);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }

  await page.setContent(fixture.replace('data-property="types"', 'data-property="types-removed"').replace('data-property="severities"', 'data-property="severities-removed"'));
  const fallback = await facetLocators(page, 'types', 'Type');
  expect(fallback.strategy).toContain('facet-ancestor');
  expect(await fallback.panel.count()).toBe(1);
  expect((await facetCandidates(fallback, 'types')).length).toBeGreaterThan(0);
});

test('bounds checkbox enumeration before normalization', async ({ page }) => {
  const values = Array.from({ length: 65 }, (_, index) => `<button role="checkbox" aria-label="Bug ${index + 1}"><span class="name">Bug ${index + 1}</span><span class="stat">1</span></button>`).join('');
  await page.setContent(`<div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group">${values}</div></div>`);
  const facet = await facetLocators(page, 'types', 'Type');
  const extracted = await facetCandidatesWithStatus(facet, 'types');
  expect(extracted.values).toHaveLength(64);
  expect(extracted.truncated).toBe(true);
});

test('preserves validated Issues URL and facets when the Issues screenshot fails', async ({ page }) => {
  const outputDirectory = path.join(os.tmpdir(), `sonarqube-output-${Date.now()}`);
  fs.writeFileSync(outputDirectory, 'not a directory');
  const issues = '<!doctype html><a href="https://sonar.example/dashboard?id=service-a">service-a</a><nav aria-label="Project"><a href="https://sonar.example/project/issues?id=service-a">Issues</a></nav><div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" aria-label="Bug 1"><span class="name">Bug</span><span class="stat">1</span></button></div></div><div data-component="facet-box" data-property="severities"><button aria-label="Severity" aria-expanded="true"></button><div role="group"><button role="checkbox" title="Critical"><span class="name">Critical</span><span class="stat">4</span></button></div></div>';
  const overall = '<!doctype html><a href="https://sonar.example/project/issues?id=service-a">Issues</a>';
  await page.route('https://sonar.example/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: url.pathname === '/project/issues' ? issues : overall });
  });
  try {
    await page.goto('https://sonar.example/dashboard?id=service-a&codeScope=overall');
    const result = await captureIssuesStep({ page, project: project(), expectedKey: 'service-a', deadline: new WorkflowDeadline(30_000), outputDirectory });
    expect(result.navigation.state).toBe('incomplete');
    expect(result.navigation.liveUrl).toContain('id=service-a');
    expect(result.facets).toEqual({ types: [{ label: 'Bug', count: 1 }], severities: [{ label: 'Critical', count: 4 }] });
    expect(result.screenshot).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/screenshot/u);
  } finally {
    await page.unroute('https://sonar.example/**');
    fs.rmSync(outputDirectory, { force: true });
  }
});

test('fails closed when Overall redirects to another project', async ({ page }) => {
  await page.context().route('https://jenkins.example/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<a href="https://sonar.example/dashboard?id=service-a">SonarQube</a>' });
  });
  await page.context().route('https://sonar.example/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.searchParams.get('codeScope') === 'overall'
      ? '<h1>Other</h1>'
      : '<a href="https://sonar.example/dashboard?id=service-a">service-a</a><a href="https://sonar.example/dashboard?id=service-a">Overview</a><h1>Overview</h1><button role="tab">Overall Code</button><script>document.querySelector("[role=tab]").onclick=()=>location.href="https://sonar.example/dashboard?id=other&codeScope=overall"</script>';
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  await page.goto('https://jenkins.example/job/service-a/');
  const result = await captureSonarqubeEvidence({ page, project: project(), deadline: new WorkflowDeadline(3_000), outputDirectory: os.tmpdir(), terminalBuildUrl: 'https://jenkins.example/job/service-a/' });
  expect(result.source.state).toBe('incomplete');
  expect(result.navigation['sonarqube-home'].state).toBe('found');
  expect(result.navigation['sonarqube-overall'].state).toBe('incomplete');
  expect(result.warnings.join(' ')).toMatch(/project|Overall/u);
});
