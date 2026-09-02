import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { createReportServer } from '../../src/reporting/report-server.js';
import { calculateEtag } from '../../src/reporting/report-server-config-store.js';

const VALID_CONFIG = {
  schemaVersion: 1,
  projects: [
    {
      id: 'demo-service',
      name: 'Demo Service',
      runType: 'report',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/demo-service/job/main/',
    },
  ],
};

test.describe('Control Config API', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let csrfToken: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-config-test-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-report-test-'));

    // Create a valid default config
    fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(VALID_CONFIG, null, 2), 'utf8');

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

  test('GET /api/configs lists discovered json configs sorted without paths', async ({ request }) => {
    fs.writeFileSync(path.join(configRoot, 'alpha.json'), JSON.stringify(VALID_CONFIG), 'utf8');
    fs.writeFileSync(path.join(configRoot, 'zeta.json'), JSON.stringify(VALID_CONFIG), 'utf8');
    fs.writeFileSync(path.join(configRoot, 'not-json.txt'), 'text', 'utf8');

    const res = await request.get(`${serverUrl}api/configs`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.configs).toEqual([
      { name: 'alpha.json' },
      { name: 'default.json' },
      { name: 'zeta.json' },
    ]);
  });

  test('GET /api/config?name= reads single config and returns ETag', async ({ request }) => {
    const res = await request.get(`${serverUrl}api/config?name=default.json`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('default.json');
    expect(body.etag).toBeDefined();
    expect(body.document.projects[0].id).toBe('demo-service');
  });

  test('GET /api/config rejects path traversal attempts', async ({ request }) => {
    const res = await request.get(`${serverUrl}api/config?name=../default.json`);
    expect(res.status()).toBe(404);
  });

  test('PUT /api/config?name= updates config atomically with valid CSRF, Origin, and If-Match', async ({ request }) => {
    const getRes = await request.get(`${serverUrl}api/config?name=default.json`);
    const initial = await getRes.json();

    const updatedDoc = {
      ...initial.document,
      projects: [
        {
          ...initial.document.projects[0],
          name: 'Updated Demo Service',
        },
      ],
    };

    const parsedServerUrl = new URL(serverUrl);
    const origin = `${parsedServerUrl.protocol}//${parsedServerUrl.host}`;

    const putRes = await request.put(`${serverUrl}api/config?name=default.json`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin,
        'if-match': initial.etag,
        'content-type': 'application/json',
      },
      data: updatedDoc,
    });

    expect(putRes.status()).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.document.projects[0].name).toBe('Updated Demo Service');
    expect(putBody.etag).not.toBe(initial.etag);

    // Verify on disk
    const onDisk = JSON.parse(fs.readFileSync(path.join(configRoot, 'default.json'), 'utf8'));
    expect(onDisk.projects[0].name).toBe('Updated Demo Service');
  });

  test('PUT /api/config rejects stale ETag with 409 conflict', async ({ request }) => {
    const parsedServerUrl = new URL(serverUrl);
    const origin = `${parsedServerUrl.protocol}//${parsedServerUrl.host}`;

    const putRes = await request.put(`${serverUrl}api/config?name=default.json`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin,
        'if-match': '"outdated-etag"',
        'content-type': 'application/json',
      },
      data: VALID_CONFIG,
    });

    expect(putRes.status()).toBe(409);
  });

  test('PUT /api/config rejects missing or invalid CSRF token with 403', async ({ request }) => {
    const parsedServerUrl = new URL(serverUrl);
    const origin = `${parsedServerUrl.protocol}//${parsedServerUrl.host}`;

    const putRes = await request.put(`${serverUrl}api/config?name=default.json`, {
      headers: {
        'x-csrf-token': 'wrong-token',
        origin,
        'if-match': '*',
        'content-type': 'application/json',
      },
      data: VALID_CONFIG,
    });

    expect(putRes.status()).toBe(403);
  });

  test('PUT /api/config rejects cross-origin request with 403', async ({ request }) => {
    const putRes = await request.put(`${serverUrl}api/config?name=default.json`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin: 'https://evil.attacker.com',
        'if-match': '*',
        'content-type': 'application/json',
      },
      data: VALID_CONFIG,
    });

    expect(putRes.status()).toBe(403);
  });
});
