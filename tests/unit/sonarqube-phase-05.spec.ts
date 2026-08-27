import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { captureSonarqubeEvidence } from '../../src/reports/sonarqube/sonarqube-capture.js';
import { assertRenderedProjectIdentity, captureIssuesStep } from '../../src/reports/sonarqube/sonarqube-capture-steps.js';
import {
  facetCandidates,
  facetCandidatesWithStatus,
  facetLocators,
  firstAvailable,
  issuesControlCandidates,
  overviewCandidates,
} from '../../src/reports/sonarqube/sonarqube-locators.js';
import {
  assertProjectUrl,
  screenshotFacetRange,
} from '../../src/reports/sonarqube/sonarqube-capture-support.js';
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

async function setSonarPage(page: Page, body: string): Promise<void> {
  await page.route('https://sonar.example/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Sonar</title>' });
  });
  await page.goto('https://sonar.example/dashboard?id=service-a');
  await page.setContent(body);
  await page.unroute('https://sonar.example/**');
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

  const customOrigin = project({
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: [], sonarqube: ['https://analysis.example'] },
    sources: { snyk: { allowedOrigins: [] }, sonarqube: { allowedOrigins: ['https://analysis.example'], projectId: 'service-a' } },
  });
  expect(classifySonarLinks([{ href: 'https://analysis.example/dashboard?id=service-a' }], customOrigin).home?.href)
    .toBe('https://analysis.example/dashboard?id=service-a');
  expect(classifySonarLinks([{ href: 'https://analysis.example/dashboard' }], customOrigin).home).toBeUndefined();
  expect(classifySonarLinks([{ href: 'https://analysis.example/dashboard?id=other', text: 'SonarQube' }], customOrigin).home)
    .toBeUndefined();
  expect(classifySonarLinks([{ href: 'https://analysis.example/dashboard?id=service-a&id=service-a', text: 'SonarQube' }], customOrigin).home)
    .toBeUndefined();
  expect(classifySonarLinks([{ href: 'https://sonar.example/artifact/reports/sonarqube/index.html?id=' }], configured).home)
    .toBeUndefined();
  expect(classifySonarLinks([{ href: 'https://sonar.example/artifact/reports/sonarqube/index.html?id=service-a&id=service-a' }], configured).home)
    .toBeUndefined();
});

test('requires home and Overview identities to remain on a Sonar dashboard', () => {
  expect(assertProjectUrl(
    'https://sonar.example/dashboard?id=service-a',
    'service-a',
    'home',
  )).toBe('https://sonar.example/dashboard?id=service-a');
  expect(() => assertProjectUrl(
    'https://sonar.example/project/issues?id=service-a',
    'service-a',
    'home',
  )).toThrow(/project dashboard/u);
  expect(() => assertProjectUrl(
    'https://sonar.example/project/issues?id=service-a',
    'service-a',
    'Overview',
  )).toThrow(/project dashboard/u);
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
  const home = `<!doctype html><title>Service A Overview</title><nav aria-label="Project"><a href="https://sonar.example/dashboard?id=service-a">Overview</a><a href="https://sonar.example/project/issues?id=service-a">Issues</a></nav><header data-component="project-content-header"><h1>Overview</h1><a role="link" href="https://sonar.example/dashboard?id=service-a" aria-label="service-a">service-a</a></header><main><button role="tab" aria-selected="false">Overall Code</button></main><script>document.querySelector('[role=tab]').addEventListener('click', () => { location.href = 'https://sonar.example/dashboard?id=service-a&codeScope=overall'; });</script>`;
  const overall = '<!doctype html><title>Service A Overall</title><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><nav aria-label="Project"><a href="https://sonar.example/project/issues?issueStatuses=OPEN&id=service-a">Issues</a></nav><main><h1>Overview</h1><div id="tabpanel-overall">overall evidence</div></main>';
  const issues = '<!doctype html><title>Service A Issues</title><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><h1>Issues</h1><nav data-testid="issues-nav-bar" aria-label="Filters"><div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="BUG" aria-label="Bug 1"><span class="name">Bug</span><span class="stat">1</span></button></div></div><div data-component="facet-box" data-property="severities"><button aria-label="Severity" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="CRITICAL" title="Critical"><span class="name">Critical</span><span class="stat">4</span></button></div></div></nav>';
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

test('captures the deterministic Jenkins archived SonarQube fixture through visible navigation', async ({ page }) => {
  const fixtureRoot = path.resolve('docker/jenkins/fixtures/reports/sonarqube');
  const home = fs.readFileSync(path.join(fixtureRoot, 'index.html'), 'utf8');
  const overall = fs.readFileSync(path.join(fixtureRoot, 'overall.html'), 'utf8');
  const issues = fs.readFileSync(path.join(fixtureRoot, 'issues.html'), 'utf8');
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-archived-fixture-'));
  const configured = project({
    sourceOrigins: { jenkins: 'https://jenkins.example', snyk: [], sonarqube: [] },
    sources: { snyk: { allowedOrigins: [] }, sonarqube: { allowedOrigins: [] } },
  });
  await page.context().route('https://jenkins.example/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/job/service-a/')
      ? '<a href="/jenkins/job/service-a/42/artifact/reports/sonarqube/index.html">sonarqube/index.html</a>'
      : url.pathname.endsWith('/artifact/reports/sonarqube/overall.html') ? overall
        : url.pathname.endsWith('/artifact/reports/sonarqube/issues.html') ? issues
          : url.pathname.endsWith('/artifact/reports/sonarqube/index.html') ? home
            : 'not found';
    await route.fulfill({ status: body === 'not found' ? 404 : 200, contentType: 'text/html', body });
  });
  try {
    await page.goto('https://jenkins.example/jenkins/job/service-a/');
    const result = await captureSonarqubeEvidence({
      page,
      project: configured,
      deadline: new WorkflowDeadline(60_000),
      outputDirectory,
      terminalBuildUrl: 'https://jenkins.example/jenkins/job/service-a/',
    });
    expect(result.source.state).toBe('found');
    expect(result.navigation['sonarqube-home'].state).toBe('found');
    expect(result.navigation['sonarqube-overall'].state).toBe('found');
    expect(result.navigation['sonarqube-issues'].state).toBe('found');
    expect(result.source.facets).toEqual({ types: [{ label: 'Bug', count: 1 }], severities: [{ label: 'Major', count: 2 }] });
    expect(result.screenshots).toEqual(['sonarqube-overall.png', 'sonarqube-issues.png']);
  } finally {
    await page.context().unroute('https://jenkins.example/**');
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('uses the scoped generated-class fallback without reading unrelated wrappers', async ({ page }) => {
  await page.setContent('<div class="css-1l8tlcx"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="BUG" aria-label="Bug 2"><span class="name">Bug</span><span class="stat">2</span></button></div></div><div class="css-1l8tlcx"><button aria-label="Tag"></button><div role="group"><button role="checkbox" data-facet="TAG" aria-label="secret row"><span class="name">Wrong</span><span class="stat">99</span></button></div></div>');
  const facet = await facetLocators(page, 'types', 'Type');
  expect(facet.strategy).toContain('scoped-generated-fallback');
  expect(await facetCandidates(facet, 'types')).toEqual([{ label: 'Bug', count: '2' }]);
});

test('extracts Type and Severity values from semantic facet links', async ({ page }) => {
  await page.setContent('<div data-component="facet-box" data-property="types"><h2>Type</h2><div role="group"><a data-facet="BUG" href="?types=BUG"><span class="name">Bug</span><span class="stat">2</span></a><a data-component="base-facet-item" href="?reset=1"><span class="name">Reset filters</span><span class="stat">999</span></a></div></div><div data-component="facet-box" data-property="severities"><h2>Severity</h2><div role="group"><a data-facet="CRITICAL" href="?severities=CRITICAL" title="Critical"><span class="name">Critical</span><span class="stat">4</span></a><a data-component="base-facet-item" href="?page=2"><span class="name">Next page</span><span class="stat">998</span></a></div></div>');
  const typeFacet = await facetLocators(page, 'types', 'Type');
  const severityFacet = await facetLocators(page, 'severities', 'Severity');
  expect(await facetCandidatesWithStatus(typeFacet, 'types')).toEqual({ values: [{ label: 'Bug', count: '2' }], truncated: false });
  expect(await facetCandidatesWithStatus(severityFacet, 'severities')).toEqual({ values: [{ label: 'Critical', count: '4' }], truncated: false });
});

test('waits for delayed semantic controls without a hard wait', async ({ page }) => {
  await page.setContent('<div id="mount"></div><script>setTimeout(() => { document.querySelector("#mount").innerHTML = "<button>Ready</button>"; }, 100);</script>');
  const control = await firstAvailable([{ locator: page.getByRole('button', { name: 'Ready', exact: true }), strategy: 'role:button:Ready' }], new WorkflowDeadline(1_000));
  expect(control.strategy).toBe('role:button:Ready');
});

test('re-resolves a delayed project Issues link', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-delayed-issues-'));
  const issues = '<!doctype html><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="BUG" aria-label="Bug 1"><span class="name">Bug</span><span class="stat">1</span></button></div></div><div data-component="facet-box" data-property="severities"><button aria-label="Severity" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="CRITICAL" title="Critical"><span class="name">Critical</span><span class="stat">4</span></button></div></div>';
  const overall = '<!doctype html><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><script>setTimeout(() => document.body.insertAdjacentHTML("beforeend", "<nav aria-label=\\"Project\\"><a href=\\"https://sonar.example/project/issues?id=service-a\\">Issues</a></nav>"), 100);</script>';
  await page.route('https://sonar.example/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: url.pathname === '/project/issues' ? issues : overall });
  });
  try {
    await page.goto('https://sonar.example/dashboard?id=service-a&codeScope=overall');
    const result = await captureIssuesStep({ page, project: project(), expectedKey: 'service-a', deadline: new WorkflowDeadline(10_000), outputDirectory });
    expect(result.facets).toEqual({ types: [{ label: 'Bug', count: 1 }], severities: [{ label: 'Critical', count: 4 }] });
  } finally {
    await page.unroute('https://sonar.example/**');
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('waits for a disabled project Issues link to become actionable', async ({ page }) => {
  await setSonarPage(page, '<nav aria-label="Project"><a aria-disabled="true" href="https://sonar.example/project/issues?id=service-a">Issues</a></nav><script>setTimeout(() => document.querySelector("a")?.removeAttribute("aria-disabled"), 100);</script>');
  const control = await firstAvailable(() => issuesControlCandidates(page, 'service-a'), new WorkflowDeadline(1_000));
  expect(await control.locator.getAttribute('aria-disabled')).toBeNull();
});

test('rejects duplicate and credential-bearing Issues targets before click', async ({ page }) => {
  await setSonarPage(page, '<nav aria-label="Project"><a href="https://sonar.example/project/issues?id=service-a&id=service-a">Issues</a></nav>');
  await expect(firstAvailable(() => issuesControlCandidates(page, 'service-a'))).rejects.toThrow(/semantic control/u);
  await setSonarPage(page, '<nav aria-label="Project"><a href="https://user:pass@sonar.example/project/issues?id=service-a">Issues</a></nav>');
  await expect(firstAvailable(() => issuesControlCandidates(page, 'service-a'))).rejects.toThrow(/semantic control/u);
});

test('scopes Overview ahead of an unrelated global control', async ({ page }) => {
  await page.setContent('<a href="/overview">Overview</a><header data-component="project-content-header"><a>service-a</a></header><main><button>Overview</button></main>');
  const control = await firstAvailable(overviewCandidates(page, 'service-a'));
  expect(control.strategy).toContain('scope:project-content');
});

test('skips a disabled semantic action while resolving controls', async ({ page }) => {
  await page.setContent('<button disabled>Ready</button><button>Ready</button>');
  const control = await firstAvailable([{ locator: page.getByRole('button', { name: 'Ready', exact: true }), strategy: 'role:button:Ready' }]);
  expect(await control.locator.isEnabled()).toBe(true);
});

test('does not accept a partial project heading as identity evidence', async ({ page }) => {
  await page.setContent('<h1>service-a details</h1>');
  await expect(assertRenderedProjectIdentity(page, 'service-a', new WorkflowDeadline(1_000))).rejects.toThrow(/Timeout|semantic control|project identity/u);
});

test('keeps the project Issues action ahead of an unrelated global Issues link', async ({ page }) => {
  await setSonarPage(page, '<a href="https://sonar.example/project/issues?id=other">Issues</a><nav aria-label="Project"><a href="https://sonar.example/project/issues?issueStatuses=OPEN&id=service-a">Issues</a></nav>');
  const control = await firstAvailable(await issuesControlCandidates(page, 'service-a'));
  expect(await control.locator.getAttribute('href')).toContain('id=service-a');
  expect(control.strategy).toContain('project-navigation');
});

test('rejects a wrong-project link inside the project navigation before fallback selection', async ({ page }) => {
  await setSonarPage(page, '<nav aria-label="Project"><a href="https://sonar.example/project/issues?id=other">Issues</a></nav><a href="https://sonar.example/project/issues?issueStatuses=OPEN&id=service-a">Issues</a>');
  await expect(firstAvailable(await issuesControlCandidates(page, 'service-a'))).rejects.toThrow(/semantic control/u);
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
  const values = Array.from({ length: 65 }, (_, index) => `<button role="checkbox" data-facet="BUG_${index + 1}" aria-label="Bug ${index + 1}"><span class="name">Bug ${index + 1}</span><span class="stat">1</span></button>`).join('');
  await page.setContent(`<div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group">${values}</div></div>`);
  const facet = await facetLocators(page, 'types', 'Type');
  const extracted = await facetCandidatesWithStatus(facet, 'types');
  expect(extracted.values).toHaveLength(64);
  expect(extracted.truncated).toBe(true);
});

test('preserves validated Issues URL and facets when the Issues screenshot fails', async ({ page }) => {
  const outputDirectory = path.join(os.tmpdir(), `sonarqube-output-${Date.now()}`);
  fs.writeFileSync(outputDirectory, 'not a directory');
  const issues = '<!doctype html><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><nav aria-label="Project"><a href="https://sonar.example/project/issues?id=service-a">Issues</a></nav><div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="BUG" aria-label="Bug 1"><span class="name">Bug</span><span class="stat">1</span></button></div></div><div data-component="facet-box" data-property="severities"><button aria-label="Severity" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="CRITICAL" title="Critical"><span class="name">Critical</span><span class="stat">4</span></button></div></div>';
  const overall = '<!doctype html><nav aria-label="Project"><a href="https://sonar.example/project/issues?id=service-a">Issues</a></nav>';
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

test('retains the available facet when the other facet is missing', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-partial-facet-'));
  const issues = '<!doctype html><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><div data-component="facet-box" data-property="types"><button aria-label="Type" aria-expanded="true"></button><div role="group"><button role="checkbox" data-facet="BUG" aria-label="Bug 1"><span class="name">Bug</span><span class="stat">1</span></button></div></div>';
  await page.route('https://sonar.example/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: url.pathname === '/project/issues' ? issues : '<!doctype html><nav aria-label="Project"><a href="https://sonar.example/project/issues?id=service-a">Issues</a></nav>' });
  });
  try {
    await page.goto('https://sonar.example/dashboard?id=service-a&codeScope=overall');
    const result = await captureIssuesStep({ page, project: project(), expectedKey: 'service-a', deadline: new WorkflowDeadline(10_000), outputDirectory });
    expect(result.facets).toEqual({ types: [{ label: 'Bug', count: 1 }], severities: [] });
    expect(result.navigation.state).toBe('incomplete');
    expect(result.warnings.join(' ')).toMatch(/Severity|screenshot skipped/u);
  } finally {
    await page.unroute('https://sonar.example/**');
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('fails closed when Overall navigates with duplicate project identities', async ({ page }) => {
  await page.context().route('https://jenkins.example/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<a href="https://sonar.example/dashboard?id=service-a">SonarQube</a>' });
  });
  await page.context().route('https://sonar.example/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.searchParams.get('codeScope') === 'overall'
      ? '<h1>Other</h1>'
      : '<header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><nav aria-label="Project"><a href="https://sonar.example/dashboard?id=service-a">Overview</a></nav><main><h1>Overview</h1><button role="tab">Overall Code</button></main><script>document.querySelector("[role=tab]").onclick=()=>location.href="https://sonar.example/dashboard?id=service-a&id=service-a&codeScope=overall"</script>';
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  await page.goto('https://jenkins.example/job/service-a/');
  const result = await captureSonarqubeEvidence({ page, project: project(), deadline: new WorkflowDeadline(3_000), outputDirectory: os.tmpdir(), terminalBuildUrl: 'https://jenkins.example/job/service-a/' });
  expect(result.source.state).toBe('incomplete');
  expect(result.navigation['sonarqube-home'].state).toBe('found');
  expect(result.navigation['sonarqube-overall'].state).toBe('incomplete');
  expect(result.warnings.join(' ')).toMatch(/project|Overall/u);
});

test('fails closed when Issues navigates with duplicate project identities', async ({ page }) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-duplicate-issues-'));
  await page.route('https://sonar.example/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname === '/project/issues'
      ? '<!doctype html><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header>'
      : '<!doctype html><header data-component="project-content-header"><a href="https://sonar.example/dashboard?id=service-a">service-a</a></header><nav aria-label="Project"><a id="issues" href="https://sonar.example/project/issues?id=service-a">Issues</a></nav><script>document.querySelector("#issues").onclick=(event)=>{event.preventDefault();location.href="https://sonar.example/project/issues?id=service-a&id=service-a";}</script>';
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  try {
    await page.goto('https://sonar.example/dashboard?id=service-a&codeScope=overall');
    await expect(captureIssuesStep({ page, project: project(), expectedKey: 'service-a', deadline: new WorkflowDeadline(1_500), outputDirectory }))
      .rejects.toThrow();
    expect(new URL(page.url()).searchParams.getAll('id')).toEqual(['service-a', 'service-a']);
  } finally {
    await page.unroute('https://sonar.example/**');
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});
