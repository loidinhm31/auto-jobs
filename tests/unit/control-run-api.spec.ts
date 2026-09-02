import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { createReportServer } from '../../src/reporting/report-server.js';
import type { NormalizedProjectConfig } from '../../src/config/config-types.js';

const createValidConfig = (artifactDir: string) => ({
  schemaVersion: 1,
  defaults: { artifactDir },
  projects: [
    { id: 'report-proj', name: 'Report Project', runType: 'report', enabled: true, loginUrl: 'https://jenkins.example.com/login', jobUrl: 'https://jenkins.example.com/job/report-proj/job/main/' },
    { id: 'build-proj', name: 'Build Project', runType: 'auto-build', enabled: true, loginUrl: 'https://jenkins.example.com/login', jobUrl: 'https://jenkins.example.com/job/build-proj/job/feat%252Fbranch/' },
    { id: 'disabled-build', name: 'Disabled Build', runType: 'auto-build', enabled: false, loginUrl: 'https://jenkins.example.com/login', jobUrl: 'https://jenkins.example.com/job/disabled/job/main/' },
  ],
});

const mockExecutors = (reportCalls: string[], buildCalls: string[], reportRoot: string) => ({
  reportExecutor: async (projects: readonly NormalizedProjectConfig[]) => {
    reportCalls.push(...projects.map((p) => p.id));
    return {
      reportRoot,
      outcomes: projects.map((p) => ({ projectId: p.id, name: p.name, state: 'success' as const, runId: 'mock-run-1', warnings: [] })),
      aggregate: { schemaVersion: 3 as const, generatedAt: new Date().toISOString(), projects: projects.map((p) => ({ projectId: p.id, name: p.name, state: 'success' as const, runId: 'mock-run-1', reportPath: `${p.id}/mock-run-1/index.html`, runs: [], warnings: [] })), warnings: [] },
      manifests: [],
      warnings: [],
      exitCode: 0 as const,
    };
  },
  autoBuildExecutor: async (project: NormalizedProjectConfig) => {
    buildCalls.push(project.id);
    return { projectId: project.id, projectName: project.name, state: 'submitted' as const, jobUrl: project.jobUrl, buildPageUrl: `${project.jobUrl}build`, submittedAt: new Date().toISOString(), responseStatus: 303, exitCode: 0 as const };
  },
});

async function pollRun(request: any, url: string, id: string): Promise<any> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(`${url}api/run?id=${id}`);
    const data = await res.json();
    if (data.run.status === 'succeeded' || data.run.status === 'failed') return data.run;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('poll timeout');
}

test.describe('Control Run API', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let origin: string;
  let csrfToken: string;
  let closeServer: () => Promise<void>;
  let reportCalls: string[] = [];
  let buildCalls: string[] = [];

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-run-config-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-run-report-'));
    reportCalls = [];
    buildCalls = [];

    fs.writeFileSync(path.join(reportRoot, 'index.html'), '<title>Vulnerability report index</title>', 'utf8');
    fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(createValidConfig(reportRoot), null, 2), 'utf8');

    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
      runManagerOptions: mockExecutors(reportCalls, buildCalls, reportRoot),
    });

    serverUrl = server.url;
    origin = `${new URL(serverUrl).protocol}//${new URL(serverUrl).host}`;
    csrfToken = server.csrfToken!;
    closeServer = server.close;
  });

  test.afterEach(async () => {
    if (closeServer) await closeServer();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('POST /api/run starts report run and polls status to completion', async ({ request }) => {
    const configRes = await request.get(`${serverUrl}api/config?name=default.json`);
    const { etag } = await configRes.json();

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'content-type': 'application/json' },
      data: { configName: 'default.json', configEtag: etag, runType: 'report' },
    });

    expect(postRes.status()).toBe(202);
    const { id, status } = await postRes.json();
    expect(id).toBeDefined();
    expect(['queued', 'running', 'succeeded']).toContain(status);

    const finalRun = await pollRun(request, serverUrl, id);
    expect(finalRun.status).toBe('succeeded');
    expect(reportCalls).toEqual(['report-proj']);
    expect(buildCalls).toHaveLength(0);
    expect(finalRun.result.reportUrl).toContain('/reports/');
  });

  test('POST /api/run starts auto-build run and returns submitted result', async ({ request }) => {
    const configRes = await request.get(`${serverUrl}api/config?name=default.json`);
    const { etag } = await configRes.json();

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'content-type': 'application/json' },
      data: { configName: 'default.json', configEtag: etag, runType: 'auto-build', projectId: 'build-proj' },
    });

    expect(postRes.status()).toBe(202);
    const { id } = await postRes.json();

    const finalRun = await pollRun(request, serverUrl, id);
    expect(finalRun.status).toBe('succeeded');
    expect(buildCalls).toEqual(['build-proj']);
    expect(reportCalls).toHaveLength(0);
    expect(finalRun.result.buildState).toBe('submitted');
  });

  test('POST /api/run rejects auto-build for disabled project with 422', async ({ request }) => {
    const configRes = await request.get(`${serverUrl}api/config?name=default.json`);
    const { etag } = await configRes.json();

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'content-type': 'application/json' },
      data: { configName: 'default.json', configEtag: etag, runType: 'auto-build', projectId: 'disabled-build' },
    });

    expect(postRes.status()).toBe(202);
    const { id } = await postRes.json();

    const finalRun = await pollRun(request, serverUrl, id);
    expect(finalRun.status).toBe('failed');
    expect(finalRun.result.error).toContain('disabled');
  });

  test('POST /api/run rejects concurrent run with 409 conflict while running', async ({ request }) => {
    const configRes = await request.get(`${serverUrl}api/config?name=default.json`);
    const { etag } = await configRes.json();

    // Start one
    const p1 = request.post(`${serverUrl}api/run`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'content-type': 'application/json' },
      data: { configName: 'default.json', configEtag: etag, runType: 'report' },
    });
    // Start second concurrently
    const p2 = request.post(`${serverUrl}api/run`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'content-type': 'application/json' },
      data: { configName: 'default.json', configEtag: etag, runType: 'report' },
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    const statuses = [res1.status(), res2.status()];
    expect(statuses).toContain(202);
  });
});
