import { createServer } from 'node:http';

import { expect, test } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { readSummary } from '../../src/reports/snyk/snyk-capture-support.js';
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
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
