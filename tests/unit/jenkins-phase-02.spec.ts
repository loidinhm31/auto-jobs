import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test, type Page } from '@playwright/test';

import { parseConfig } from '../../src/config.js';
import { formatJenkinsFailure } from '../../src/jenkins/errors.js';
import { loginToJenkins } from '../../src/jenkins/auth.js';
import { openExistingBuild, resolveQueuedBuild, waitForTerminalBuild } from '../../src/jenkins/build.js';
import { resolveJenkinsJob, type JenkinsJobReference } from '../../src/jenkins/job.js';
import { UiBuildTrigger } from '../../src/jenkins/trigger.js';
import { parseBuildReference, parseQueueReference } from '../../src/jenkins/url-identity.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';
import { pollUntil } from '../../src/workflow/poll-until.js';

function config(baseUrl = 'https://jenkins.example/jenkins') {
  return parseConfig({
    JENKINS_BASE_URL: baseUrl,
    JENKINS_USERNAME: 'user',
    JENKINS_PASSWORD: 'password',
    JENKINS_JOB_PATH: 'service-a',
    JENKINS_TIMEOUT_MS: '1000',
    JENKINS_POLL_INTERVAL_MS: '1',
    JENKINS_BUILD_URL_SELECTOR: JSON.stringify({ kind: 'css', value: 'a[href]', required: true }),
  });
}

function job(baseUrl = 'https://jenkins.example/jenkins'): JenkinsJobReference {
  return {
    name: 'service-a',
    path: 'service-a',
    url: `${baseUrl}/job/service-a/`,
  };
}

function configWithoutBuildHooks(baseUrl = 'https://jenkins.example/jenkins') {
  return parseConfig({
    JENKINS_BASE_URL: baseUrl,
    JENKINS_USERNAME: 'user',
    JENKINS_PASSWORD: 'password',
    JENKINS_JOB_PATH: 'service-a',
    JENKINS_TIMEOUT_MS: '1000',
    JENKINS_POLL_INTERVAL_MS: '1',
  });
}

async function serve(page: Page, body: string) {
  await page.route('https://jenkins.example/jenkins/**', (route) => route.fulfill({
    contentType: 'text/html', body,
  }));
  await page.goto(job().url);
}

test('uses immutable deadline budget and configured polling cadence', async () => {
  const deadline = new WorkflowDeadline(100, 1_000);
  expect(deadline.expiresAt).toBe(1_100);
  expect(deadline.remainingMs(1_050)).toBe(50);
  let attempts = 0;
  const result = await pollUntil({
    deadline: new WorkflowDeadline(100), intervalMs: 1,
    observe: async () => ++attempts, accept: (value) => value === 2,
  });
  expect(result.value).toBe(2);
  expect(attempts).toBe(2);
});

test('bounds polling attempts separately from retained observations', async () => {
  let attempts = 0;
  await expect(pollUntil({
    deadline: new WorkflowDeadline(500), intervalMs: 1, maxObservations: 1, maxAttempts: 3,
    observe: async () => { attempts += 1; return false; }, accept: () => false,
  })).rejects.toThrow(/polling attempt limit/u);
  expect(attempts).toBe(3);
});

test('parses only exact same-context queue and build references', () => {
  expect(parseQueueReference('https://jenkins.example/jenkins/queue/item/7/', config().baseUrl))
    .toEqual({ id: 7, url: 'https://jenkins.example/jenkins/queue/item/7/' });
  expect(parseQueueReference('https://jenkins.example/queue/item/7/', config().baseUrl)).toBeUndefined();
  expect(parseQueueReference('https://jenkins.example/jenkins/queue/item/999999999999999999999/', config().baseUrl))
    .toBeUndefined();
  expect(parseBuildReference('https://jenkins.example/jenkins/job/service-a/8/', config().baseUrl, job().url))
    .toEqual({ number: 8, url: 'https://jenkins.example/jenkins/job/service-a/8/' });
  expect(parseBuildReference('https://jenkins.example/jenkins/job/other/8/', config().baseUrl, job().url))
    .toBeUndefined();
  expect(parseBuildReference('https://evil.example/jenkins/job/service-a/8/', config().baseUrl, job().url))
    .toBeUndefined();
  expect(parseQueueReference('https://jenkins.example/jenkins/queue/item/7/?view=1', config().baseUrl)).toBeUndefined();
  expect(parseBuildReference('https://jenkins.example/jenkins/job/service-a/8/#details', config().baseUrl, job().url))
    .toBeUndefined();
});

test('rejects login and job navigation responses with HTTP errors', async ({ page }) => {
  await page.route('https://jenkins.example/jenkins/login', (route) => route.fulfill({ status: 404, body: '<label>Username</label>' }));
  await expect(loginToJenkins(page, config(), new WorkflowDeadline(500))).rejects.toThrow(/login failed/u);

  await page.unrouteAll();
  await page.route(job().url, (route) => route.fulfill({ status: 403, body: '<h1>service-a</h1>' }));
  await expect(resolveJenkinsJob(page, config(), new WorkflowDeadline(500))).rejects.toThrow(/job resolution failed/u);
});

test('redacts configured secrets that appear in diagnostic URL paths', async ({ page }) => {
  await page.route('https://jenkins.example/jenkins/password/', (route) => route.fulfill({ body: '<h1>failure</h1>' }));
  await page.goto('https://jenkins.example/jenkins/password/');
  const message = formatJenkinsFailure('Jenkins failure', new Error('request failed'), config(), page);
  expect(message).not.toContain('password');
  expect(message).toContain('[REDACTED]');

  await page.unrouteAll();
  await page.route('https://jenkins.example/jenkins/**', (route) => route.fulfill({ body: '<h1>failure</h1>' }));
  await page.goto('https://jenkins.example/jenkins/pass%77ord/');
  const encodedMessage = formatJenkinsFailure('Jenkins failure', new Error('request failed'), config(), page);
  expect(encodedMessage).not.toContain('password');
});

test('rejects a similar Jenkins heading rather than accepting a substring', async ({ page }) => {
  await serve(page, '<h1>service-a-old</h1>');
  await expect(resolveJenkinsJob(page, config(), new WorkflowDeadline(500))).rejects.toThrow(
    /job resolution failed/u,
  );
});

test('defers parameterized jobs without any interaction or baseline', async ({ page }) => {
  await serve(page, '<button onclick="window.wasClicked = true">Build with Parameters</button>');
  const trigger = new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500));
  const result = await trigger.trigger();
  expect(result).toMatchObject({
    triggered: false, capability: 'unsupported_parameterized', triggerAttempts: 0,
    state: 'unsupported_parameterized',
  });
  expect(result.baseline).toBeUndefined();
  expect(await page.evaluate(() => (window as Window & { wasClicked?: boolean }).wasClicked)).toBeUndefined();
});

test('captures a pre-click baseline and accepts only a new correlated queue item', async ({ page }) => {
  await serve(page, `<button>Build Now</button>
    <a href="/jenkins/queue/item/30/">old</a><a href="/jenkins/job/service-a/2/">2</a>`);
  await page.route('https://jenkins.example/jenkins/queue/item/31/', (route) => route.fulfill({
    contentType: 'text/html', body: '<a href="/jenkins/queue/item/31/">queue 31</a>',
  }));
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => window.location.assign('/jenkins/queue/item/31/'));
  });
  const trigger = new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500));
  const result = await trigger.trigger();
  expect(result).toMatchObject({
    triggered: true, capability: 'build_now', triggerAttempts: 1, state: 'queue_correlated',
    queueUrl: 'https://jenkins.example/jenkins/queue/item/31/',
    baseline: { latestBuildNumber: 2, queueItems: [{ id: 30 }] },
  });
  await expect(trigger.trigger()).rejects.toThrow(/already evaluated/u);
});

test('accepts a new queue link rendered by the Build Now document navigation', async ({ page }) => {
  await serve(page, '<button>Build Now</button><a href="/jenkins/queue/item/30/">old</a>');
  await page.route('https://jenkins.example/jenkins/job/service-a/?submitted=1', (route) => route.fulfill({
    contentType: 'text/html', body: '<a href="/jenkins/queue/item/31/">queue 31</a>',
  }));
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => window.location.assign('/jenkins/job/service-a/?submitted=1'));
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500)).trigger())
    .resolves.toMatchObject({ state: 'queue_correlated', queueUrl: 'https://jenkins.example/jenkins/queue/item/31/' });
});

test('correlates a Build Now response through its exact queue Location', async ({ page }) => {
  await serve(page, '<a href="/jenkins/job/service-a/build?delay=0sec">Build Now</a><a href="/jenkins/queue/item/30/">old</a>');
  await page.route('**/job/service-a/build**', async (route) => {
    await route.fulfill({ status: 201, headers: { location: '/jenkins/queue/item/31/' }, body: '' });
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500)).trigger())
    .resolves.toMatchObject({ state: 'queue_correlated', queueUrl: 'https://jenkins.example/jenkins/queue/item/31/' });
});

test('does not accept a queue navigation redirect directly to a newer build', async ({ page }) => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const host = `http://${request.headers.host}`;
    const localJobUrl = `${host}/jenkins/job/service-a/`;
    if (requestUrl.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<button>Build Now</button><a href="/jenkins/queue/item/30/">old</a><a href="/jenkins/job/service-a/2/">2</a>');
      return;
    }
    if (requestUrl.pathname === '/jenkins/queue/item/31/') {
      response.writeHead(302, { location: `${localJobUrl}3/` });
      response.end();
      return;
    }
    if (requestUrl.pathname === '/jenkins/job/service-a/3/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<h1>service-a</h1>');
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/jenkins`;
    const localJob = job(baseUrl);
    await page.goto(localJob.url);
    await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button, queueUrl) => {
      button.addEventListener('click', () => window.location.assign(queueUrl));
    }, `${baseUrl}/queue/item/31/`);
    await expect(new UiBuildTrigger(page, config(baseUrl), localJob, new WorkflowDeadline(500)).trigger()).rejects.toThrow(
      /build trigger failed/u,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('does not correlate an unrelated queue item when a Build Now POST has no Location', async ({ page }) => {
  await serve(page, '<button>Build Now</button><a href="/jenkins/queue/item/30/">old</a>');
  await page.route('**/job/service-a/build**', async (route) => {
    await route.fulfill({ status: 201, body: '' });
  });
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<a href="/jenkins/queue/item/31/">unrelated</a>');
      void fetch('/jenkins/job/service-a/build', { method: 'POST' });
    });
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500)).trigger()).rejects.toThrow(
    /build trigger failed/u,
  );
});

test('rejects generic latest-build links after a Build Now submission', async ({ page }) => {
  await serve(page, '<a href="/jenkins/job/service-a/lastBuild/">last build</a>');
  await page.setContent('<button>Build Now</button><a href="/jenkins/job/service-a/lastBuild/">last build</a>');
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(100)).trigger()).rejects.toThrow(
    /build trigger failed/u,
  );
});

test('rejects a concurrent queue link that was not the Build Now navigation response', async ({ page }) => {
  await serve(page, '<button>Build Now</button>');
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => document.body.insertAdjacentHTML(
      'beforeend', '<a href="/jenkins/queue/item/99/">concurrent</a>',
    ));
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(100)).trigger()).rejects.toThrow(
    /build trigger failed/u,
  );
});

test('validates exact existing build URLs without a trigger', async ({ page }) => {
  await serve(page, '<h1>service-a</h1>');
  const runConfig = { ...config(), buildNumber: 8 };
  await page.route('https://jenkins.example/jenkins/job/service-a/8/', (route) => route.fulfill({
    contentType: 'text/html', body: '<h1>service-a</h1><a href="/jenkins/job/service-a/8/">build 8</a>',
  }));
  await expect(openExistingBuild(page, runConfig, job(), new WorkflowDeadline(500))).resolves.toEqual({
    number: 8, url: 'https://jenkins.example/jenkins/job/service-a/8/',
  });
});

test('accepts standard Jenkins build markup without custom status and URL hooks', async ({ page }) => {
  const build = { number: 8, url: 'https://jenkins.example/jenkins/job/service-a/8/' };
  await page.route(build.url, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<div class="jenkins-build-caption"><span class="jenkins-visually-hidden">Success</span></div>',
  }));
  await expect(waitForTerminalBuild(
    page, configWithoutBuildHooks(), job(), build, new WorkflowDeadline(500),
  )).resolves.toMatchObject({ build, status: 'Success' });
});

test('uses the standard Jenkins build API when the status caption is still running', async ({ page }) => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (requestUrl.pathname === '/jenkins/job/service-a/3/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div class="jenkins-build-caption"><span>Building</span></div>');
      return;
    }
    if (requestUrl.pathname === '/jenkins/job/service-a/3/api/json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ building: false, result: 'SUCCESS' }));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/jenkins`;
    const localJob = { ...job(), url: `${baseUrl}/job/service-a/` };
    const build = { number: 3, url: `${localJob.url}3/` };
    await expect(waitForTerminalBuild(
      page, configWithoutBuildHooks(baseUrl), localJob, build, new WorkflowDeadline(500),
    )).resolves.toMatchObject({ build, status: 'SUCCESS' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('rejects a 404 page that preserves an existing-build URL', async ({ page }) => {
  await page.route('https://jenkins.example/jenkins/job/service-a/8/', (route) => route.fulfill({
    status: 404, contentType: 'text/html',
    body: '<h1>Not Found</h1><a href="/jenkins/job/service-a/8/">build 8</a>',
  }));
  await expect(openExistingBuild(
    page, { ...config(), buildNumber: 8 }, job(), new WorkflowDeadline(500),
  )).rejects.toThrow(/existing build selection failed/u);
});

test('resolves a build only from the correlated queue item', async ({ page }) => {
  await page.route('https://jenkins.example/jenkins/queue/item/31/', (route) => route.fulfill({
    contentType: 'text/html', body: '<a href="/jenkins/job/service-a/3/">build 3</a>',
  }));
  await expect(resolveQueuedBuild(
    page, config(), job(), { id: 31, url: 'https://jenkins.example/jenkins/queue/item/31/' },
    2, new WorkflowDeadline(500),
  )).resolves.toEqual({ number: 3, url: 'https://jenkins.example/jenkins/job/service-a/3/' });
});

test('uses the standard Jenkins queue API when the queue page has no build link', async ({ page }) => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (requestUrl.pathname === '/jenkins/queue/item/31/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<p>Queue item exists. For details check the API.</p>');
      return;
    }
    if (requestUrl.pathname === '/jenkins/queue/item/31/api/json') {
      const jobUrl = `http://${request.headers.host}/jenkins/job/service-a/`;
      const build = `${jobUrl}3/`;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        cancelled: false,
        task: { url: jobUrl },
        executable: { number: 3, url: build },
      }));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/jenkins`;
    const localJob = { ...job(), url: `${baseUrl}/job/service-a/` };
    const queue = { id: 31, url: `${baseUrl}/queue/item/31` };
    await expect(resolveQueuedBuild(
      page, configWithoutBuildHooks(baseUrl), localJob, queue, 2, new WorkflowDeadline(500),
    )).resolves.toEqual({ number: 3, url: `${baseUrl}/job/service-a/3/` });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('requires queue API proof for a newer link under the default build selector', async ({ page }) => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const host = `http://${request.headers.host}`;
    const localJobUrl = `${host}/jenkins/job/service-a/`;
    if (requestUrl.pathname === '/jenkins/queue/item/31/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<a href="${localJobUrl}3/">concurrent build 3</a>`);
      return;
    }
    if (requestUrl.pathname === '/jenkins/queue/item/31/api/json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        cancelled: false,
        task: { url: localJobUrl },
        executable: { number: 4, url: `${localJobUrl}4/` },
      }));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/jenkins`;
    const localJob = { ...job(), url: `${baseUrl}/job/service-a/` };
    const queue = { id: 31, url: `${baseUrl}/queue/item/31/` };
    await expect(resolveQueuedBuild(
      page, configWithoutBuildHooks(baseUrl), localJob, queue, 2, new WorkflowDeadline(500),
    )).rejects.toThrow(/queue-to-build correlation failed/u);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('recovers when the correlated queue item disappears before its build link is rendered', async ({ page }) => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const host = `http://${request.headers.host}`;
    const localJobUrl = `${host}/jenkins/job/service-a/`;
    if (requestUrl.pathname === '/jenkins/queue/item/31/') {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<p>Queue item is gone</p>');
      return;
    }
    if (requestUrl.pathname === '/jenkins/queue/item/31/api/json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        cancelled: false,
        task: { url: localJobUrl },
        executable: { number: 3, url: `${localJobUrl}3/` },
      }));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/jenkins`;
    const localJob = { ...job(), url: `${baseUrl}/job/service-a/` };
    const queue = { id: 31, url: `${baseUrl}/queue/item/31/` };
    await expect(resolveQueuedBuild(
      page, configWithoutBuildHooks(baseUrl), localJob, queue, 2, new WorkflowDeadline(500),
    )).resolves.toEqual({ number: 3, url: `${baseUrl}/job/service-a/3/` });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('rejects a queue-to-build redirect without an exact queue API executable', async ({ page }) => {
  let apiRequests = 0;
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const host = `http://${request.headers.host}`;
    const localJobUrl = `${host}/jenkins/job/service-a/`;
    if (requestUrl.pathname === '/jenkins/queue/item/31/') {
      response.writeHead(302, { location: `${localJobUrl}3/` });
      response.end();
      return;
    }
    if (requestUrl.pathname === '/jenkins/queue/item/31/api/json') {
      apiRequests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        cancelled: true,
        task: { url: localJobUrl },
        executable: { number: 3, url: `${localJobUrl}3/` },
      }));
      return;
    }
    if (requestUrl.pathname === '/jenkins/job/service-a/3/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<h1>service-a</h1><a href="/jenkins/job/service-a/3/">build 3</a>');
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/jenkins`;
    const localJob = { ...job(), url: `${baseUrl}/job/service-a/` };
    const queue = { id: 31, url: `${baseUrl}/queue/item/31/` };
    await expect(resolveQueuedBuild(
      page, configWithoutBuildHooks(baseUrl), localJob, queue, 2, new WorkflowDeadline(500),
    )).rejects.toThrow(/queue-to-build correlation failed/u);
    expect(apiRequests).toBeGreaterThan(0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('does not accept a concurrent job-page decoy after a queue redirect', async ({ page }) => {
  let jobPageVisited = false;
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const host = `http://${request.headers.host}`;
    const localJobUrl = `${host}/jenkins/job/service-a/`;
    if (requestUrl.pathname === '/jenkins/queue/item/31/') {
      response.writeHead(302, { location: localJobUrl });
      response.end();
      return;
    }
    if (requestUrl.pathname === '/jenkins/queue/item/31/api/json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ cancelled: false, task: { url: localJobUrl } }));
      return;
    }
    if (requestUrl.pathname === '/jenkins/job/service-a/') {
      jobPageVisited = true;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<h1>service-a</h1><a href="${localJobUrl}3/">concurrent build 3</a>`);
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/jenkins`;
    const localJob = { ...job(), url: `${baseUrl}/job/service-a/` };
    const queue = { id: 31, url: `${baseUrl}/queue/item/31/` };
    await expect(resolveQueuedBuild(
      page, configWithoutBuildHooks(baseUrl), localJob, queue, 2, new WorkflowDeadline(500),
    )).rejects.toThrow(/queue-to-build correlation failed/u);
    expect(jobPageVisited).toBe(true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('does not replace an active queue item with a concurrent newer build', async ({ page }) => {
  const build = 'https://jenkins.example/jenkins/job/service-a/3/';
  await page.route('https://jenkins.example/jenkins/queue/item/31/', (route) => route.fulfill({
    contentType: 'text/html', body: '<p>Waiting for executor</p>',
  }));
  await page.route(job().url, (route) => route.fulfill({
    contentType: 'text/html', body: `<h1>service-a</h1><a href="${build}">concurrent build 3</a>`,
  }));
  await expect(resolveQueuedBuild(
    page, configWithoutBuildHooks(), job(), { id: 31, url: 'https://jenkins.example/jenkins/queue/item/31/' },
    2, new WorkflowDeadline(100),
  )).rejects.toThrow(/queue-to-build correlation failed/u);
});
