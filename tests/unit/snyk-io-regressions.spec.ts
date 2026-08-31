import { createServer } from 'node:http';

import { expect, test } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { pageLinkCandidatesWithStatus, readSummary } from '../../src/reports/snyk/snyk-capture-support.js';
import { MAX_SUMMARY_BYTES } from '../../src/reports/snyk/snyk-summary-parser.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

function project(origin: string): NormalizedProjectConfig {
  return {
    id: 'service-a', name: 'Service A', enabled: true, schemaVersion: 1,
    loginUrl: `${origin}/login`,
    jobUrl: `${origin}/job/service-a/`,
    browser: 'chromium', artifactDir: 'reports',
    credentialVariables: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    sourceOrigins: { jenkins: origin, snyk: [origin], sonarqube: [] },
    sources: { snyk: { allowedOrigins: [origin] }, sonarqube: { allowedOrigins: [] } },
    selectors: { snykReport: { kind: 'testId', value: 'snyk-report', required: false } },
  } as unknown as NormalizedProjectConfig;
}

test('follows only bounded same-origin summary redirects and rejects declared oversized bodies', async ({ page }) => {
  const server = createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/summary' });
      response.end();
      return;
    }
    if (request.url === '/summary') {
      const body = JSON.stringify({ severity_counts: { critical: 1, high: 2, medium: 0, low: 0 } });
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      response.end(body);
      return;
    }
    if (request.url === '/chunked') {
      const body = JSON.stringify({ severity_counts: { critical: 1, high: 2, medium: 0, low: 0 } });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(body);
      return;
    }
    if (request.url === '/large') {
      const body = 'x'.repeat(MAX_SUMMARY_BYTES + 1);
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test server did not expose a port');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const summary = await readSummary(page, `${origin}/redirect`, project(origin), new WorkflowDeadline(10_000));
    expect(summary.url).toBe(`${origin}/summary`);
    expect(summary.parsed.counts).toEqual({ critical: 1, high: 2, medium: 0, low: 0 });
    await expect(readSummary(page, `${origin}/large`, project(origin), new WorkflowDeadline(10_000)))
      .rejects.toThrow(/exceeds/u);
    await expect(readSummary(page, `${origin}/chunked`, project(origin), new WorkflowDeadline(10_000)))
      .rejects.toThrow(/Content-Length/iu);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('bounds a response body when Content-Length understates it', async ({ page }) => {
  const originalFetch = globalThis.fetch;
  const oversized = new Uint8Array(MAX_SUMMARY_BYTES + 1);
  globalThis.fetch = (async (input) => ({
    url: String(input),
    status: 200,
    headers: new Headers({
      'content-type': 'application/json',
      'content-length': '1',
    }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    }),
  })) as typeof globalThis.fetch;
  try {
    await expect(readSummary(
      page,
      'https://jenkins.example/summary',
      project('https://jenkins.example'),
      new WorkflowDeadline(10_000),
    )).rejects.toThrow(/exceeds/iu);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails closed when page link metadata exceeds field or total budgets', async ({ page }) => {
  await page.setContent(`<a href="https://jenkins.example/job/service-a/">${'x'.repeat(2_049)}</a>`);
  const oversizedField = await pageLinkCandidatesWithStatus(page);
  expect(oversizedField.truncated).toBe(true);
  expect(oversizedField.candidates).toEqual([]);

  const anchors = Array.from({ length: 256 }, (_, index) =>
    `<a href="https://jenkins.example/job/${index}" aria-label="${'a'.repeat(500)}" title="${'b'.repeat(500)}">${'c'.repeat(500)}</a>`,
  ).join('');
  await page.setContent(anchors);
  const oversizedTotal = await pageLinkCandidatesWithStatus(page);
  expect(oversizedTotal.truncated).toBe(true);
  expect(oversizedTotal.candidates.length).toBeLessThan(256);
});
