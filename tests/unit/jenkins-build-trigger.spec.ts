import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';

import { triggerParameterizedBuild } from '../../src/jenkins/build-trigger.js';
import { JenkinsFlowError } from '../../src/jenkins/errors.js';
import { DEFAULT_JENKINS_RUNNER_SELECTORS, type JenkinsRunnerConfig } from '../../src/jenkins/runner-config.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

function runnerConfig(baseUrl: string): JenkinsRunnerConfig {
  return {
    baseUrl,
    loginUrl: `${baseUrl}/login`,
    jobUrl: `${baseUrl}/job/service-a/`,
    username: 'test-user',
    password: 'super-secret-password',
    timeoutMs: 2_000,
    browser: 'chromium',
    selectors: DEFAULT_JENKINS_RUNNER_SELECTORS,
  };
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}/jenkins` };
}
async function close(server: Server): Promise<void> {
  if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

const VALID_FORM = '<div id="bottom-sticker"><form method="POST" action="/jenkins/job/service-a/build"><button class="jenkins-button jenkins-button--primary jenkins-!-build-color">Build</button></form></div>';

test('submits parameterized build when side-panel link and bottom-sticker form are valid', async ({ page }) => {
  let postCount = 0;
  const { server, baseUrl } = await listen((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div id="side-panel"><a href="/jenkins/job/service-a/build">Build with Parameters</a></div>');
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/build') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(VALID_FORM);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/jenkins/job/service-a/build') {
      postCount += 1;
      response.writeHead(302, { location: '/jenkins/job/service-a/' });
      response.end();
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  try {
    const config = runnerConfig(baseUrl);
    await page.goto(`${baseUrl}/job/service-a/`);
    const result = await triggerParameterizedBuild(page, config, new WorkflowDeadline(2_000));
    expect(result.state).toBe('submitted');
    expect(result.jobUrl).toBe(config.jobUrl);
    expect(result.responseStatus).toBe(302);
    expect(postCount).toBe(1);
  } finally {
    await close(server);
  }
});

test('handles rejected build response >= 400', async ({ page }) => {
  let postCount = 0;
  const { server, baseUrl } = await listen((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div id="side-panel"><a href="/jenkins/job/service-a/build">Build with Parameters</a></div>');
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/build') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(VALID_FORM);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/jenkins/job/service-a/build') {
      postCount += 1;
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('Forbidden');
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  try {
    const config = runnerConfig(baseUrl);
    await page.goto(`${baseUrl}/job/service-a/`);
    const result = await triggerParameterizedBuild(page, config, new WorkflowDeadline(2_000));
    expect(result.state).toBe('rejected');
    expect(result.responseStatus).toBe(403);
    expect(postCount).toBe(1);
  } finally {
    await close(server);
  }
});

test('handles post-observed timeout as submission-unknown without retry', async ({ page }) => {
  let postCount = 0;
  const { server, baseUrl } = await listen((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div id="side-panel"><a href="/jenkins/job/service-a/build">Build with Parameters</a></div>');
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/build') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(VALID_FORM);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/jenkins/job/service-a/build') {
      postCount += 1;
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  try {
    const config = { ...runnerConfig(baseUrl), timeoutMs: 800 };
    await page.goto(`${baseUrl}/job/service-a/`);
    const result = await triggerParameterizedBuild(page, config, new WorkflowDeadline(800));
    expect(result.state).toBe('submission-unknown');
    expect(postCount).toBe(1);
  } finally {
    await close(server);
  }
});

test('rejects link outside #side-panel and button outside #bottom-sticker', async ({ page }) => {
  const { server, baseUrl } = await listen((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div id="main-panel"><a href="/jenkins/job/service-a/build">Build with Parameters</a></div>');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  try {
    const config = runnerConfig(baseUrl);
    await page.goto(`${baseUrl}/job/service-a/`);
    await expect(triggerParameterizedBuild(page, config, new WorkflowDeadline(1_000))).rejects.toThrow(JenkinsFlowError);
  } finally {
    await close(server);
  }
});

test('rejects button missing required classes or form pointing to foreign action', async ({ page }) => {
  const { server, baseUrl } = await listen((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div id="side-panel"><a href="/jenkins/job/service-a/build">Build with Parameters</a></div>');
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jenkins/job/service-a/build') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div id="bottom-sticker"><form method="POST" action="/jenkins/job/other-job/build"><button class="jenkins-button">Build</button></form></div>');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  try {
    const config = runnerConfig(baseUrl);
    await page.goto(`${baseUrl}/job/service-a/`);
    await expect(triggerParameterizedBuild(page, config, new WorkflowDeadline(1_000))).rejects.toThrow(JenkinsFlowError);
  } finally {
    await close(server);
  }
});

test('redacts credentials from error diagnostics', async ({ page }) => {
  const config = runnerConfig('http://127.0.0.1:9999/jenkins');
  let thrownError: Error | undefined;
  try {
    await triggerParameterizedBuild(page, config, new WorkflowDeadline(200));
  } catch (error) {
    thrownError = error as Error;
  }
  expect(thrownError).toBeDefined();
  expect(thrownError?.message).not.toContain('super-secret-password');
});
