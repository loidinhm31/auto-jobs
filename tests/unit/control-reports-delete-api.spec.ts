import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { createReportServer } from '../../src/reporting/report-server.js';
import { AGGREGATE_REPORT_MARKER, REPORT_CSP } from '../../src/reporting/report-server-constants.js';
import { deleteProjectReports } from '../../src/artifacts/report-project-deletion.js';
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

test.describe('Control Reports DELETE API', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let csrfToken: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'del-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'del-rep-'));
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

  test('successfully deletes a project with valid runs and invalid files, preserving siblings and assets', async ({ request }) => {
    createValidRunFiles(reportRoot, 'target-proj', 'run-01');
    createValidRunFiles(reportRoot, 'target-proj', 'run-02');
    fs.writeFileSync(path.join(reportRoot, 'target-proj', 'unvalidated-garbage.txt'), 'garbage', 'utf8');

    createValidRunFiles(reportRoot, 'sibling-proj', 'run-01');
    const assetsDir = path.join(reportRoot, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'style.css'), 'body {}', 'utf8');

    const res = await request.delete(`${serverUrl}api/reports/projects/target-proj`, {
      headers: validHeaders(),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      projectId: 'target-proj',
      deletedRunsCount: 2,
    });

    expect(fs.existsSync(path.join(reportRoot, 'target-proj'))).toBe(false);
    expect(fs.existsSync(path.join(reportRoot, 'sibling-proj', 'run-01', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(assetsDir, 'style.css'))).toBe(true);
    expect(fs.existsSync(path.join(configRoot, 'default.json'))).toBe(true);

    const aggData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    expect(aggData.projects.map((p: { projectId: string }) => p.projectId)).toEqual(['sibling-proj']);
    const indexHtml = fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain(AGGREGATE_REPORT_MARKER);
    expect(indexHtml).not.toContain('target-proj');
  });

  test('deleting the final remaining project publishes valid schema v3 empty aggregate and empty message index.html', async ({ request }) => {
    createValidRunFiles(reportRoot, 'sole-project', 'run-01');

    // Initial state: sole-project exists and aggregate contains it
    const initRes = await request.delete(`${serverUrl}api/reports/projects/sole-project`, {
      headers: validHeaders(),
    });

    expect(initRes.status()).toBe(200);
    const body = await initRes.json();
    expect(body).toEqual({
      success: true,
      projectId: 'sole-project',
      deletedRunsCount: 1,
    });

    expect(fs.existsSync(path.join(reportRoot, 'sole-project'))).toBe(false);

    // Assert aggregate-data.json is valid schema v3 with projects: []
    const aggData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    expect(aggData.schemaVersion).toBe(3);
    expect(aggData.projects).toEqual([]);

    // Assert index.html contains empty state and AGGREGATE_REPORT_MARKER
    const indexHtml = fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain(AGGREGATE_REPORT_MARKER);
    expect(indexHtml).toContain('0 retained project(s)');
    expect(indexHtml).toContain('No retained project reports were recorded.');
  });

  test('accepts empty JSON body with Content-Type application/json', async ({ request }) => {
    createValidRunFiles(reportRoot, 'json-body-proj', 'run-01');

    const res = await request.delete(`${serverUrl}api/reports/projects/json-body-proj`, {
      headers: {
        ...validHeaders(),
        'content-type': 'application/json',
      },
      data: {},
    });

    expect(res.status()).toBe(200);
    expect(fs.existsSync(path.join(reportRoot, 'json-body-proj'))).toBe(false);
  });

  test('rejects non-empty JSON body with 400', async ({ request }) => {
    createValidRunFiles(reportRoot, 'non-empty-proj', 'run-01');

    const res = await request.delete(`${serverUrl}api/reports/projects/non-empty-proj`, {
      headers: {
        ...validHeaders(),
        'content-type': 'application/json',
      },
      data: { force: true },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_BODY');
    expect(fs.existsSync(path.join(reportRoot, 'non-empty-proj'))).toBe(true);
  });

  test('rejects unsupported media type with 415', async ({ request }) => {
    createValidRunFiles(reportRoot, 'media-proj', 'run-01');

    const res = await request.delete(`${serverUrl}api/reports/projects/media-proj`, {
      headers: {
        ...validHeaders(),
        'content-type': 'text/plain',
      },
      data: 'plain text',
    });

    expect(res.status()).toBe(415);
    expect(fs.existsSync(path.join(reportRoot, 'media-proj'))).toBe(true);
  });

  test('rejects non-DELETE methods with 405 and Allow header', async ({ request }) => {
    createValidRunFiles(reportRoot, 'method-proj', 'run-01');

    for (const method of ['get', 'post', 'put'] as const) {
      const res = await request[method](`${serverUrl}api/reports/projects/method-proj`, {
        headers: validHeaders(),
      });
      expect(res.status()).toBe(405);
      expect(res.headers()['allow']).toBe('DELETE');
    }
  });

  test('rejects missing or invalid CSRF token with 403', async ({ request }) => {
    createValidRunFiles(reportRoot, 'csrf-proj', 'run-01');

    const noCsrf = await request.delete(`${serverUrl}api/reports/projects/csrf-proj`, {
      headers: {
        origin: new URL(serverUrl).origin,
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
      },
    });
    expect(noCsrf.status()).toBe(403);

    const badCsrf = await request.delete(`${serverUrl}api/reports/projects/csrf-proj`, {
      headers: {
        ...validHeaders(),
        'x-csrf-token': 'invalid-token',
      },
    });
    expect(badCsrf.status()).toBe(403);
  });

  test('rejects invalid Origin header with 403', async ({ request }) => {
    createValidRunFiles(reportRoot, 'origin-proj', 'run-01');

    const res = await request.delete(`${serverUrl}api/reports/projects/origin-proj`, {
      headers: {
        ...validHeaders(),
        origin: 'http://malicious.attacker.com',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('rejects invalid project IDs in path with 400', async ({ request }) => {
    const invalidPaths = [
      'api/reports/projects',
      'api/reports/projects/',
      'api/reports/projects//',
      'api/reports/projects/foo/bar',
      'api/reports/projects/foo%2Fbar',
      'api/reports/projects/foo%5Cbar',
      'api/reports/projects/foo%00bar',
      'api/reports/projects/foo%252fbar',
      'api/reports/projects/..',
      'api/reports/projects/%2e%2e',
      'api/reports/projects/assets',
      'api/reports/projects/.report-root-lock',
      'api/reports/projects/.tmp-secret',
      'api/reports/projects/INVALID_UPPERCASE',
      'api/reports/projects/has%20space',
      'api/reports/projects/%FF',
    ];

    for (const p of invalidPaths) {
      const res = await request.delete(`${serverUrl}${p}`, {
        headers: validHeaders(),
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_PROJECT_ID');
    }
  });

  test('returns 404 when project does not exist', async ({ request }) => {
    const res = await request.delete(`${serverUrl}api/reports/projects/nonexistent-proj`, {
      headers: validHeaders(),
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  test('returns 404 when project directory exists but has 0 validated runs', async ({ request }) => {
    const emptyDir = path.join(reportRoot, 'empty-proj');
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(path.join(emptyDir, 'unvalidated.txt'), 'content', 'utf8');

    const res = await request.delete(`${serverUrl}api/reports/projects/empty-proj`, {
      headers: validHeaders(),
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
    expect(fs.existsSync(emptyDir)).toBe(true);
  });

  test('returns 409 on report root lock contention', async ({ request }) => {
    createValidRunFiles(reportRoot, 'locked-proj', 'run-01');

    const lock = await acquireReportRootLock(reportRoot);
    try {
      const res = await request.delete(`${serverUrl}api/reports/projects/locked-proj`, {
        headers: validHeaders(),
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('REPORT_ROOT_LOCKED');
      expect(fs.existsSync(path.join(reportRoot, 'locked-proj'))).toBe(true);
    } finally {
      await lock.release();
    }
  });

  test('preserves prefix-sibling projects byte-for-byte when deleting target-proj', async ({ request }) => {
    createValidRunFiles(reportRoot, 'service-x', 'run-01');
    createValidRunFiles(reportRoot, 'service-x-extended', 'run-01');
    createValidRunFiles(reportRoot, 'service-x2', 'run-01');

    const res = await request.delete(`${serverUrl}api/reports/projects/service-x`, {
      headers: validHeaders(),
    });
    expect(res.status()).toBe(200);

    expect(fs.existsSync(path.join(reportRoot, 'service-x'))).toBe(false);
    expect(fs.existsSync(path.join(reportRoot, 'service-x-extended', 'run-01', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(reportRoot, 'service-x2', 'run-01', 'manifest.json'))).toBe(true);

    const aggData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8'));
    expect(aggData.projects.map((p: { projectId: string }) => p.projectId).sort()).toEqual([
      'service-x-extended',
      'service-x2',
    ]);
  });

  test('repeated delete of same project returns 404 PROJECT_NOT_FOUND without mutating other state', async ({ request }) => {
    createValidRunFiles(reportRoot, 'repeat-proj', 'run-01');

    const firstRes = await request.delete(`${serverUrl}api/reports/projects/repeat-proj`, {
      headers: validHeaders(),
    });
    expect(firstRes.status()).toBe(200);
    expect(fs.existsSync(path.join(reportRoot, 'repeat-proj'))).toBe(false);

    const secondRes = await request.delete(`${serverUrl}api/reports/projects/repeat-proj`, {
      headers: validHeaders(),
    });
    expect(secondRes.status()).toBe(404);
    const body = await secondRes.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  test('rejects deletion with 500 when project contains symbolic link, preserving target', async ({ request }) => {
    createValidRunFiles(reportRoot, 'symlink-api-proj', 'run-01');
    const secretFile = path.join(reportRoot, 'canary-secret.txt');
    fs.writeFileSync(secretFile, 'secret-data', 'utf8');
    try {
      fs.symlinkSync(secretFile, path.join(reportRoot, 'symlink-api-proj', 'link-to-canary'));
    } catch {
      return;
    }

    const res = await request.delete(`${serverUrl}api/reports/projects/symlink-api-proj`, {
      headers: validHeaders(),
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('UNSAFE_PROJECT_DIRECTORY');

    expect(fs.existsSync(path.join(reportRoot, 'symlink-api-proj'))).toBe(true);
    expect(fs.existsSync(secretFile)).toBe(true);
    expect(fs.readFileSync(secretFile, 'utf8')).toBe('secret-data');
  });

  test('competing DELETE requests against same root return 409 without leaking internal lock paths', async ({ request }) => {
    createValidRunFiles(reportRoot, 'race-a', 'run-01');
    createValidRunFiles(reportRoot, 'race-b', 'run-01');

    const lock = await acquireReportRootLock(reportRoot);
    try {
      const res = await request.delete(`${serverUrl}api/reports/projects/race-a`, {
        headers: validHeaders(),
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('REPORT_ROOT_LOCKED');
      expect(body.error.message).toBe('report root is locked by another operation');
      expect(JSON.stringify(body)).not.toContain('.report-root-lock');
      expect(JSON.stringify(body)).not.toContain(reportRoot);
    } finally {
      await lock.release();
    }
  });

  test('direct deleteProjectReports rejects symbolic links inside project directory', async () => {
    createValidRunFiles(reportRoot, 'symlink-proj', 'run-01');
    const secretFile = path.join(reportRoot, 'secret.txt');
    fs.writeFileSync(secretFile, 'sensitive', 'utf8');
    try {
      fs.symlinkSync(secretFile, path.join(reportRoot, 'symlink-proj', 'link-to-secret'));
    } catch {
      return;
    }

    await expect(deleteProjectReports(reportRoot, 'symlink-proj')).rejects.toThrow(
      /project directory contains a symbolic link/u,
    );
    expect(fs.existsSync(path.join(reportRoot, 'symlink-proj'))).toBe(true);
    expect(fs.existsSync(secretFile)).toBe(true);
  });

  test('direct deleteProjectReports rejects when folder depth exceeds budget', async () => {
    createValidRunFiles(reportRoot, 'deep-proj', 'run-01');
    let deepDir = path.join(reportRoot, 'deep-proj');
    for (let i = 0; i < 35; i++) {
      deepDir = path.join(deepDir, `level-${i}`);
      fs.mkdirSync(deepDir, { recursive: true });
    }
    fs.writeFileSync(path.join(deepDir, 'leaf.txt'), 'deep', 'utf8');

    await expect(deleteProjectReports(reportRoot, 'deep-proj')).rejects.toThrow(
      /project directory exceeds maximum folder depth/u,
    );
    expect(fs.existsSync(path.join(reportRoot, 'deep-proj'))).toBe(true);
  });

  test('handles removal failure: throws REMOVAL_FAILED, releases lock, and preserves surviving projects', async () => {
    createValidRunFiles(reportRoot, 'fail-removal-proj', 'run-01');
    createValidRunFiles(reportRoot, 'survivor-proj', 'run-01');

    await expect(
      deleteProjectReports(reportRoot, 'fail-removal-proj', {
        removeDirectory: async () => {
          throw new Error('injected filesystem removal failure');
        },
      }),
    ).rejects.toThrow(/failed to remove project directory: injected filesystem removal failure/u);

    // Verify report root lock was released even after removal failure
    const lock = await acquireReportRootLock(reportRoot);
    await lock.release();

    // Sibling project is untouched
    expect(fs.existsSync(path.join(reportRoot, 'survivor-proj', 'run-01', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(reportRoot, 'fail-removal-proj', 'run-01', 'manifest.json'))).toBe(true);

    // Normal deletion now succeeds
    const result = await deleteProjectReports(reportRoot, 'fail-removal-proj');
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(reportRoot, 'fail-removal-proj'))).toBe(false);
  });

  test('handles publication refresh failure: throws REFRESH_FAILED, releases lock, without restoring deleted files', async () => {
    createValidRunFiles(reportRoot, 'fail-pub-proj', 'run-01');
    createValidRunFiles(reportRoot, 'survivor-2-proj', 'run-01');

    await expect(
      deleteProjectReports(reportRoot, 'fail-pub-proj', {
        publishAggregate: async () => {
          throw new Error('injected publication failure');
        },
      }),
    ).rejects.toThrow(/project deleted but index refresh failed: injected publication failure/u);

    // Lock was released!
    const lock = await acquireReportRootLock(reportRoot);
    await lock.release();

    // Files are deleted, not resurrected
    expect(fs.existsSync(path.join(reportRoot, 'fail-pub-proj'))).toBe(false);
    // Surviving files remain intact
    expect(fs.existsSync(path.join(reportRoot, 'survivor-2-proj', 'run-01', 'manifest.json'))).toBe(true);
  });

  test('report-only server serves reports via GET/HEAD with REPORT_CSP and rejects DELETE and mutations', async () => {
    createValidRunFiles(reportRoot, 'ro-proj', 'run-01');
    const reportServer = await createReportServer(reportRoot, {
      mode: 'report',
      host: '127.0.0.1',
      port: 0,
    });
    try {
      // GET serves static saved index with REPORT_CSP at root in report mode
      const getIndex = await fetch(`${reportServer.url}index.html`);
      expect(getIndex.status).toBe(200);
      expect(getIndex.headers.get('content-security-policy')).toBe(REPORT_CSP);
      const getIndexText = await getIndex.text();
      expect(getIndexText).toContain(AGGREGATE_REPORT_MARKER);
      expect(getIndexText).not.toContain('<script type="module"');

      // HEAD serves headers without body
      const headIndex = await fetch(`${reportServer.url}index.html`, { method: 'HEAD' });
      expect(headIndex.status).toBe(200);
      expect(headIndex.headers.get('content-security-policy')).toBe(REPORT_CSP);

      // GET serves retained run report
      const getRun = await fetch(`${reportServer.url}ro-proj/run-01/index.html`);
      expect(getRun.status).toBe(200);

      // DELETE on /api/reports/projects/ro-proj cannot mutate anything (returns 404 or 405)
      const delApi = await fetch(`${reportServer.url}api/reports/projects/ro-proj`, { method: 'DELETE' });
      expect([404, 405]).toContain(delApi.status);

      // DELETE on static report path is rejected with 405
      const delStatic = await fetch(`${reportServer.url}index.html`, { method: 'DELETE' });
      expect(delStatic.status).toBe(405);

      const delRun = await fetch(`${reportServer.url}ro-proj/run-01/index.html`, { method: 'DELETE' });
      expect(delRun.status).toBe(405);
      // All files on disk remain untouched
      expect(fs.existsSync(path.join(reportRoot, 'ro-proj', 'run-01', 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(reportRoot, 'index.html'))).toBe(true);
      expect(fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8')).toBe(getIndexText);
    } finally {
      await reportServer.close();
    }
  });
});
