import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { createReportServer, type ReportServerHandle } from '../../src/reporting/report-server.js';
import { SECRETS_FILE_NAME } from '../../src/reporting/report-server-constants.js';

test.describe('Control Secrets API - Operations', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let csrfToken: string;
  let serverHandle: ReportServerHandle;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-secrets-test-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-report-test-'));

    serverHandle = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
    });
    serverUrl = serverHandle.url;
    csrfToken = serverHandle.csrfToken!;
  });

  test.afterEach(async () => {
    if (serverHandle) await serverHandle.close();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('GET /api/secrets returns empty presence map when no secrets exist', async ({ request }) => {
    const res = await request.get(`${serverUrl}api/secrets`);
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({ secrets: {} });
  });

  test('GET /api/secrets returns boolean presence map for stored secrets', async ({ request }) => {
    await serverHandle.secretStore!.putSecret('KEY_1', 'val-1');
    await serverHandle.secretStore!.putSecret('KEY_2', 'val-2');

    const res = await request.get(`${serverUrl}api/secrets`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      secrets: {
        KEY_1: true,
        KEY_2: true,
      },
    });
  });

  test('GET /api/secrets?keys= filters by requested keys and flags missing ones as false', async ({ request }) => {
    await serverHandle.secretStore!.putSecret('EXISTS', 'val');

    const res = await request.get(`${serverUrl}api/secrets?keys=EXISTS,NOT_EXISTS`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      secrets: {
        EXISTS: true,
        NOT_EXISTS: false,
      },
    });
  });

  test('PUT /api/secrets updates single secret and writes to disk', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    const res = await request.put(`${serverUrl}api/secrets`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      },
      data: { name: 'JENKINS_PASSWORD', value: 'secret-pass-789' },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ secrets: { JENKINS_PASSWORD: true } });

    const rawDisk = JSON.parse(fs.readFileSync(path.join(configRoot, SECRETS_FILE_NAME), 'utf8'));
    expect(rawDisk['JENKINS_PASSWORD']).toBe('secret-pass-789');
  });

  test('PUT /api/secrets updates batch secrets with secrets object', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    const res = await request.put(`${serverUrl}api/secrets`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      },
      data: {
        secrets: {
          KEY_A: 'val_a',
          KEY_B: 'val_b',
        },
      },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ secrets: { KEY_A: true, KEY_B: true } });

    const stored = await serverHandle.secretStore!.readSecrets();
    expect(stored['KEY_A']).toBe('val_a');
    expect(stored['KEY_B']).toBe('val_b');
  });

  test('PUT /api/secrets deletes secret when value is null or action is delete', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    await serverHandle.secretStore!.putSecrets({ KEEP: 'k', DEL_1: 'd1', DEL_2: 'd2' });

    const res1 = await request.put(`${serverUrl}api/secrets`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'sec-fetch-site': 'same-origin' },
      data: { secrets: { DEL_1: null } },
    });
    expect(res1.status()).toBe(200);
    expect((await res1.json()).secrets).toEqual({ KEEP: true, DEL_2: true });

    const res2 = await request.put(`${serverUrl}api/secrets`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'sec-fetch-site': 'same-origin' },
      data: { name: 'DEL_2', action: 'delete' },
    });
    expect(res2.status()).toBe(200);
    expect((await res2.json()).secrets).toEqual({ KEEP: true });
  });

  test('DELETE /api/secrets removes variable by query parameter', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    await serverHandle.secretStore!.putSecrets({ FOO: 'bar', BAZ: 'qux' });

    const res = await request.delete(`${serverUrl}api/secrets?name=FOO`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'sec-fetch-site': 'same-origin' },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ secrets: { BAZ: true } });

    const stored = await serverHandle.secretStore!.readSecrets();
    expect(stored['FOO']).toBeUndefined();
    expect(stored['BAZ']).toBe('qux');
  });

  test('DELETE /api/secrets removes variables by JSON body', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    await serverHandle.secretStore!.putSecrets({ VAR_1: '1', VAR_2: '2', VAR_3: '3' });

    const res = await request.delete(`${serverUrl}api/secrets`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      data: { names: ['VAR_1', 'VAR_2'] },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ secrets: { VAR_3: true } });
  });
});
