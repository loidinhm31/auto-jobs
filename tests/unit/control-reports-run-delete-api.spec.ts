import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { createReportServer } from '../../src/reporting/report-server.js';
import { AGGREGATE_REPORT_MARKER } from '../../src/reporting/report-server-constants.js';
import { deleteProjectRunReport } from '../../src/artifacts/report-run-deletion.js';
import { acquireReportRootLock } from '../../src/artifacts/report-root-lock-owner.js';

function createValidRunFiles(reportRoot: string, projectId: string, runId: string): void {
  const dir = path.join(reportRoot, projectId, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      kind: 'project-run',
      schemaVersion: 3,
      project: { id: projectId, name: `Project ${projectId}` },
      run: { runId, observedAt: '2026-09-24T10:00:00.000Z' },
      state: 'failed',
      artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
      warnings: [],
      diagnostic: 'test failure',
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'data.json'),
    JSON.stringify({
      schemaVersion: 3,
      project: { id: projectId, name: `Project ${projectId}` },
      run: { runId, observedAt: '2026-09-24T10:00:00.000Z' },
      state: 'failed',
      diagnostic: 'test failure',
      warnings: [],
    }),
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>Report</body></html>', 'utf8');
}

function initReportRoot(reportRoot: string): void {
  fs.writeFileSync(
    path.join(reportRoot, 'index.html'),
    `<!DOCTYPE html><html><head>${AGGREGATE_REPORT_MARKER}</head><body>Index</body></html>`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(reportRoot, 'aggregate-data.json'),
    JSON.stringify({ schemaVersion: 3, generatedAt: '2026-09-24T10:00:00.000Z', projects: [], warnings: [] }),
    'utf8',
  );
}

test.describe('Control Reports Run DELETE API', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let csrfToken: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'del-run-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'del-run-rep-'));
    initReportRoot(reportRoot);

    fs.writeFileSync(
      path.join(configRoot, 'default.json'),
      JSON.stringify({ schemaVersion: 1, projects: [] }),
      'utf8',
    );

    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
    });
    serverUrl = server.url;
    csrfToken = server.csrfToken!;
    closeServer = server.close;
  });

  test.afterEach(async () => {
    if (closeServer) await closeServer();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  function validHeaders() {
    const parsed = new URL(serverUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return {
      'x-csrf-token': csrfToken,
      origin,
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
    };
  }

  test('deleting a single run removes run directory and preserves sibling runs in same project', async ({ request }) => {
    createValidRunFiles(reportRoot, 'my-service', 'run-01');
    createValidRunFiles(reportRoot, 'my-service', 'run-02');

    const res = await request.delete(`${serverUrl}api/reports/projects/my-service/runs/run-01`, {
      headers: validHeaders(),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      projectId: 'my-service',
      runId: 'run-01',
      remainingRunsCount: 1,
    });

    // run-01 is deleted, run-02 remains
    expect(fs.existsSync(path.join(reportRoot, 'my-service', 'run-01'))).toBe(false);
    expect(fs.existsSync(path.join(reportRoot, 'my-service', 'run-02', 'manifest.json'))).toBe(true);

    // Aggregate updated: lists my-service with only run-02
    const aggData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    const proj = aggData.projects.find((p: { projectId: string }) => p.projectId === 'my-service');
    expect(proj).toBeDefined();
    expect(proj.runs.map((r: { runId: string }) => r.runId)).toEqual(['run-02']);
  });

  test('deleting final remaining run in project prunes the empty project directory', async ({ request }) => {
    createValidRunFiles(reportRoot, 'single-run-svc', 'run-only');

    const res = await request.delete(`${serverUrl}api/reports/projects/single-run-svc/runs/run-only`, {
      headers: validHeaders(),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      projectId: 'single-run-svc',
      runId: 'run-only',
      remainingRunsCount: 0,
    });

    // Both run dir and project dir are pruned!
    expect(fs.existsSync(path.join(reportRoot, 'single-run-svc', 'run-only'))).toBe(false);
    expect(fs.existsSync(path.join(reportRoot, 'single-run-svc'))).toBe(false);

    // Aggregate reflects 0 projects
    const aggData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    expect(aggData.projects).toEqual([]);
  });

  test('rejects missing or malformed run routes with 400', async ({ request }) => {
    const invalidPaths = [
      'api/reports/projects/my-service/runs',
      'api/reports/projects/my-service/runs/',
      'api/reports/projects/my-service/runs//',
      'api/reports/projects/my-service/runs/..',
      'api/reports/projects/my-service/runs/%2e%2e',
      'api/reports/projects/my-service/runs/foo/bar',
      'api/reports/projects/my-service/runs/INVALID_UPPERCASE',
      'api/reports/projects/my-service/runs/has%20space',
      'api/reports/projects/my-service/runs/%FF',
      'api/reports/projects/my-service/runs/%252frun',
    ];

    for (const p of invalidPaths) {
      const res = await request.delete(`${serverUrl}${p}`, {
        headers: validHeaders(),
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(['INVALID_RUN_ID', 'INVALID_PROJECT_ID']).toContain(body.error.code);
    }
  });

  test('returns 404 when project or run does not exist', async ({ request }) => {
    // Project does not exist
    const noProj = await request.delete(`${serverUrl}api/reports/projects/nonexistent/runs/run-01`, {
      headers: validHeaders(),
    });
    expect(noProj.status()).toBe(404);
    expect((await noProj.json()).error.code).toBe('RUN_NOT_FOUND');

    // Project exists, but run does not exist
    createValidRunFiles(reportRoot, 'exist-proj', 'run-01');
    const noRun = await request.delete(`${serverUrl}api/reports/projects/exist-proj/runs/run-nonexistent`, {
      headers: validHeaders(),
    });
    expect(noRun.status()).toBe(404);
    expect((await noRun.json()).error.code).toBe('RUN_NOT_FOUND');
  });

  test('returns 409 on report root lock contention during run deletion', async ({ request }) => {
    createValidRunFiles(reportRoot, 'locked-svc', 'run-01');

    const lock = await acquireReportRootLock(reportRoot);
    try {
      const res = await request.delete(`${serverUrl}api/reports/projects/locked-svc/runs/run-01`, {
        headers: validHeaders(),
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('REPORT_ROOT_LOCKED');
      expect(JSON.stringify(body)).not.toContain('.report-root-lock');
      expect(fs.existsSync(path.join(reportRoot, 'locked-svc', 'run-01'))).toBe(true);
    } finally {
      await lock.release();
    }
  });

  test('rejects missing or invalid CSRF with 403', async ({ request }) => {
    createValidRunFiles(reportRoot, 'csrf-svc', 'run-01');

    const noCsrf = await request.delete(`${serverUrl}api/reports/projects/csrf-svc/runs/run-01`, {
      headers: {
        origin: new URL(serverUrl).origin,
      },
    });
    expect(noCsrf.status()).toBe(403);

    const badCsrf = await request.delete(`${serverUrl}api/reports/projects/csrf-svc/runs/run-01`, {
      headers: {
        ...validHeaders(),
        'x-csrf-token': 'bad-token',
      },
    });
    expect(badCsrf.status()).toBe(403);
  });

  test('rejects non-DELETE methods with 405 and Allow header', async ({ request }) => {
    createValidRunFiles(reportRoot, 'method-svc', 'run-01');

    for (const m of ['get', 'post', 'put'] as const) {
      const res = await request[m](`${serverUrl}api/reports/projects/method-svc/runs/run-01`, {
        headers: validHeaders(),
      });
      expect(res.status()).toBe(405);
      expect(res.headers()['allow']).toBe('DELETE');
    }
  });

  test('direct deleteProjectRunReport handles removal failure, releases lock, and preserves project files', async () => {
    createValidRunFiles(reportRoot, 'fail-rm-run-svc', 'run-01');

    await expect(
      deleteProjectRunReport(reportRoot, 'fail-rm-run-svc', 'run-01', {
        removeDirectory: async () => {
          throw new Error('injected run removal failure');
        },
      }),
    ).rejects.toThrow(/failed to remove run directory: injected run removal failure/u);

    // Verify lock released
    const lock = await acquireReportRootLock(reportRoot);
    await lock.release();

    // Files are untouched
    expect(fs.existsSync(path.join(reportRoot, 'fail-rm-run-svc', 'run-01', 'manifest.json'))).toBe(true);
  });
});
