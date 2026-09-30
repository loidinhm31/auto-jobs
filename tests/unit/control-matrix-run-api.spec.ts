import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { createReportServer } from '../../src/reporting/report-server.js';
import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import type { ControlRunRecord } from '../../src/reporting/report-server-run-manager.js';

interface PollResponse {
  run: ControlRunRecord;
}

const createMatrixConfig = (artifactDir: string) => ({
  schemaVersion: 1,
  defaults: { artifactDir },
  jobColumns: [
    { id: 'col-main', name: 'Main Job' },
    { id: 'col-stage', name: 'Stage Job' },
  ],
  projects: [
    {
      id: 'proj-alpha',
      name: 'Project Alpha',
      runType: 'report',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/alpha-main/',
      selectedJobColumns: ['col-main', 'col-stage'],
      jobs: {
        'col-main': 'https://jenkins.example.com/job/alpha-main/',
        'col-stage': 'https://jenkins.example.com/job/alpha-stage/',
      },
    },
    {
      id: 'proj-beta',
      name: 'Project Beta',
      runType: 'auto-build',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/beta-main/',
      selectedJobColumns: ['col-main', 'col-stage'],
      jobs: {
        'col-main': 'https://jenkins.example.com/job/beta-main/',
        'col-stage': '   ', // blank cell
      },
    },
    {
      id: 'proj-gamma',
      name: 'Project Gamma',
      runType: 'report',
      enabled: false,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/gamma-main/',
      selectedJobColumns: ['col-main', 'col-stage'],
      jobs: {
        'col-main': 'https://jenkins.example.com/job/gamma-main/',
        'col-stage': 'https://jenkins.example.com/job/gamma-stage/',
      },
    },
  ],
});

const mockExecutors = (reportCalls: string[], buildCalls: string[], reportRoot: string) => ({
  reportExecutor: async (projects: readonly NormalizedProjectConfig[]) => {
    reportCalls.push(...projects.map((p) => p.id));
    return {
      reportRoot,
      outcomes: projects.map((p) => ({
        projectId: p.id,
        name: p.name,
        state: 'success' as const,
        runId: 'mock-run-1',
        warnings: [],
      })),
      aggregate: {
        schemaVersion: 3 as const,
        generatedAt: new Date().toISOString(),
        projects: projects.map((p) => ({
          projectId: p.id,
          name: p.name,
          state: 'success' as const,
          runId: 'mock-run-1',
          reportPath: `${p.id}/mock-run-1/index.html`,
          runs: [],
          warnings: [],
        })),
        warnings: [],
      },
      manifests: [],
      warnings: [],
      exitCode: 0 as const,
    };
  },
  autoBuildExecutor: async (project: NormalizedProjectConfig) => {
    buildCalls.push(project.id);
    return {
      projectId: project.id,
      projectName: project.name,
      state: 'submitted' as const,
      jobUrl: project.jobUrl,
      buildPageUrl: `${project.jobUrl}build`,
      submittedAt: new Date().toISOString(),
      responseStatus: 303,
      exitCode: 0 as const,
    };
  },
});

async function pollRun(
  request: APIRequestContext,
  url: string,
  id: string,
): Promise<ControlRunRecord> {
  for (let i = 0; i < 30; i++) {
    const res = await request.get(`${url}api/run?id=${id}`);
    const data = (await res.json()) as PollResponse;
    if (data.run.status === 'succeeded' || data.run.status === 'failed') return data.run;
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 50);
    await promise;
  }
  throw new Error('poll timeout');
}

async function getConfigEtag(request: APIRequestContext, url: string): Promise<string> {
  const res = await request.get(`${url}api/config?name=default.json`);
  const data = (await res.json()) as { etag: string };
  return data.etag;
}

test.describe('Control Matrix Run API', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let origin: string;
  let csrfToken: string;
  let closeServer: () => Promise<void>;
  let reportCalls: string[] = [];
  let buildCalls: string[] = [];

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-run-config-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-run-report-'));
    reportCalls = [];
    buildCalls = [];

    fs.writeFileSync(
      path.join(reportRoot, 'index.html'),
      '<title>Vulnerability report index</title>',
      'utf8',
    );
    fs.writeFileSync(
      path.join(configRoot, 'default.json'),
      JSON.stringify(createMatrixConfig(reportRoot), null, 2),
      'utf8',
    );

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
    await closeServer();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('POST /api/run with matrix targets starts report run and produces typed per-target outcomes', async ({
    request,
  }) => {
    const etag = await getConfigEtag(request, serverUrl);

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: {
        origin,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      data: {
        configName: 'default.json',
        configEtag: etag,
        runType: 'report',
        targets: [
          { projectId: 'proj-alpha', columnId: 'col-main' },
          { projectId: 'proj-alpha', columnId: 'col-stage' },
        ],
      },
    });

    expect(postRes.status()).toBe(202);
    const body = (await postRes.json()) as { id: string; status: string };
    expect(body.id).toBeTruthy();

    const record = await pollRun(request, serverUrl, body.id);
    expect(record.status).toBe('succeeded');
    expect(reportCalls).toEqual(['proj-alpha--col-main', 'proj-alpha--col-stage']);
    expect(record.result?.reportUrl).toBe('/reports/index.html');
    expect(record.result?.reportProjects).toHaveLength(2);

    const first = record.result?.reportProjects?.[0];
    expect(first?.targetId).toBe('proj-alpha--col-main');
    expect(first?.projectId).toBe('proj-alpha');
    expect(first?.columnId).toBe('col-main');
    expect(first?.status).toBe('success');
    expect(first?.reportUrl).toBe('/reports/proj-alpha--col-main/mock-run-1/index.html');
  });

  test('POST /api/run with matrix targets starts auto-build run and produces annotated build outcomes', async ({
    request,
  }) => {
    const etag = await getConfigEtag(request, serverUrl);

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: {
        origin,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      data: {
        configName: 'default.json',
        configEtag: etag,
        runType: 'auto-build',
        targets: [
          { projectId: 'proj-alpha', columnId: 'col-main' },
          { projectId: 'proj-beta', columnId: 'col-main' },
        ],
      },
    });

    expect(postRes.status()).toBe(202);
    const body = (await postRes.json()) as { id: string; status: string };

    const record = await pollRun(request, serverUrl, body.id);
    expect(record.status).toBe('succeeded');
    expect(buildCalls).toEqual(['proj-alpha--col-main', 'proj-beta--col-main']);
    expect(record.result?.buildProjects).toHaveLength(2);

    const betaOutcome = record.result?.buildProjects?.[1];
    expect(betaOutcome?.projectId).toBe('proj-beta--col-main');
    expect(betaOutcome?.columnId).toBe('col-main');
    expect(betaOutcome?.sourceProjectId).toBe('proj-beta');
  });

  test('skips blank cells and executes remaining populated targets', async ({ request }) => {
    const etag = await getConfigEtag(request, serverUrl);

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: {
        origin,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      data: {
        configName: 'default.json',
        configEtag: etag,
        runType: 'report',
        targets: [
          { projectId: 'proj-beta', columnId: 'col-main' },
          { projectId: 'proj-beta', columnId: 'col-stage' }, // blank URL in config
        ],
      },
    });

    expect(postRes.status()).toBe(202);
    const body = (await postRes.json()) as { id: string };
    const record = await pollRun(request, serverUrl, body.id);

    expect(record.status).toBe('succeeded');
    // Only nonblank target executed
    expect(reportCalls).toEqual(['proj-beta--col-main']);
  });

  test('rejects matrix request with unknown property with 422', async ({ request }) => {
    const etag = await getConfigEtag(request, serverUrl);

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: {
        origin,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      data: {
        configName: 'default.json',
        configEtag: etag,
        runType: 'report',
        targets: [{ projectId: 'proj-alpha', columnId: 'col-main' }],
        extraParam: 'not-allowed',
      },
    });

    expect(postRes.status()).toBe(422);
    const body = (await postRes.json()) as { error: { message: string } };
    expect(body.error.message).toContain("unknown field 'extraParam'");
  });

  test('rejects matrix request with projectId with 422', async ({ request }) => {
    const etag = await getConfigEtag(request, serverUrl);

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: {
        origin,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      data: {
        configName: 'default.json',
        configEtag: etag,
        runType: 'report',
        projectId: 'proj-alpha',
        targets: [{ projectId: 'proj-alpha', columnId: 'col-main' }],
      },
    });

    expect(postRes.status()).toBe(422);
    const body = (await postRes.json()) as { error: { message: string } };
    expect(body.error.message).toContain('projectId must not be provided when targets are specified');
  });

  test('rejects matrix request with duplicate coordinates with 422', async ({ request }) => {
    const etag = await getConfigEtag(request, serverUrl);

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: {
        origin,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      data: {
        configName: 'default.json',
        configEtag: etag,
        runType: 'report',
        targets: [
          { projectId: 'proj-alpha', columnId: 'col-main' },
          { projectId: 'proj-alpha', columnId: 'col-main' },
        ],
      },
    });

    expect(postRes.status()).toBe(422);
    const body = (await postRes.json()) as { error: { message: string } };
    expect(body.error.message).toContain('duplicate coordinate');
  });

  test('fails execution when all targets are blank cells', async ({ request }) => {
    const etag = await getConfigEtag(request, serverUrl);

    const postRes = await request.post(`${serverUrl}api/run`, {
      headers: {
        origin,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      data: {
        configName: 'default.json',
        configEtag: etag,
        runType: 'report',
        targets: [{ projectId: 'proj-beta', columnId: 'col-stage' }],
      },
    });

    expect(postRes.status()).toBe(202);
    const body = (await postRes.json()) as { id: string };
    const record = await pollRun(request, serverUrl, body.id);

    expect(record.status).toBe('failed');
    expect(record.result?.error).toContain('No executable targets remaining after skipping blank cells');
  });
});
