import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReportServer, type ReportServerHandle } from '../../src/reporting/report-server.js';
import { handleSecretsApi } from '../../src/reporting/report-server-control-secrets-api.js';
import type { ControlRouterContext } from '../../src/reporting/report-server-control.js';

test.describe('Control Secrets API - Security & Validation', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let csrfToken: string;
  let serverHandle: ReportServerHandle;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-secrets-sec-test-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-report-sec-test-'));

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

  test('Zero leakage: GET and PUT never echo plaintext secret values', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    const secretValue = 'strictly-confidential-token-12345';

    const putRes = await request.put(`${serverUrl}api/secrets`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      },
      data: { name: 'TOP_SECRET', value: secretValue },
    });
    expect(putRes.status()).toBe(200);
    const putText = await putRes.text();
    expect(putText).not.toContain(secretValue);

    const getRes = await request.get(`${serverUrl}api/secrets`);
    expect(getRes.status()).toBe(200);
    const getText = await getRes.text();
    expect(getText).not.toContain(secretValue);
  });

  test('PUT /api/secrets rejects missing or invalid CSRF token with 403', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');

    const res1 = await request.put(`${serverUrl}api/secrets`, {
      headers: { origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      data: { name: 'VAR', value: 'val' },
    });
    expect(res1.status()).toBe(403);
    expect((await res1.json()).error.code).toBe('FORBIDDEN');

    const res2 = await request.put(`${serverUrl}api/secrets`, {
      headers: { 'x-csrf-token': 'wrong-token', origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      data: { name: 'VAR', value: 'val' },
    });
    expect(res2.status()).toBe(403);
  });

  test('PUT /api/secrets rejects cross-origin request with 403', async ({ request }) => {
    const res = await request.put(`${serverUrl}api/secrets`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin: 'https://attacker-site.com',
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
      },
      data: { name: 'VAR', value: 'val' },
    });
    expect(res.status()).toBe(403);
  });

  test('PUT /api/secrets rejects invalid key names with 400', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    const invalidKeys = ['123_NUMERIC', 'DASHED-KEY', 'DOT.KEY', '__proto__', ''];

    for (const key of invalidKeys) {
      const res = await request.put(`${serverUrl}api/secrets`, {
        headers: { 'x-csrf-token': csrfToken, origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
        data: { name: key, value: 'val' },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe('INVALID_KEY');
    }
  });

  test('PUT /api/secrets rejects non-string values with 400', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    const res = await request.put(`${serverUrl}api/secrets`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      data: { name: 'VALID_KEY', value: 99999 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_SECRET_VALUE');
  });

  test('PUT /api/secrets rejects malformed or empty request body with 400', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    const res = await request.put(`${serverUrl}api/secrets`, {
      headers: { 'x-csrf-token': csrfToken, origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('MALFORMED_REQUEST');
  });

  test('DELETE /api/secrets rejects without CSRF or Origin with 403', async ({ request }) => {
    const res = await request.delete(`${serverUrl}api/secrets?name=FOO`);
    expect(res.status()).toBe(403);
  });

  test('Unsupported HTTP methods return 405 with Allow header', async ({ request }) => {
    const res = await request.patch(`${serverUrl}api/secrets`);
    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('GET, PUT, DELETE');
    expect((await res.json()).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  test('GET /api/secrets rejects invalid Host header with 403', async ({ request }) => {
    const res = await request.get(`${serverUrl}api/secrets`, {
      headers: { host: 'evil-host.com:9999' },
    });
    expect(res.status()).toBe(403);
  });

  test('PUT /api/secrets with non-JSON Content-Type returns 415 with UNSUPPORTED_MEDIA_TYPE', async ({ request }) => {
    const origin = serverUrl.replace(/\/$/, '');
    const res = await request.put(`${serverUrl}api/secrets`, {
      headers: {
        'x-csrf-token': csrfToken,
        origin,
        'sec-fetch-site': 'same-origin',
        'content-type': 'text/plain',
      },
      data: 'plain text body',
    });
    expect(res.status()).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('GET /api/secrets returns 503 SERVICE_UNAVAILABLE when secretStore is undefined', async () => {
    let statusCode = 0;
    let responseBody = '';
    const mockResponse = {
      writeHead(status: number) { statusCode = status; return this; },
      setHeader() { return this; },
      end(data: string) { responseBody = data; },
      headersSent: false,
    } as unknown as ServerResponse;
    const mockContext = {
      host: '127.0.0.1',
      port: 4173,
      csrfToken: 'token',
      reportRoot: '',
      configStore: undefined as unknown as ControlRouterContext['configStore'],
      runManager: undefined as unknown as ControlRouterContext['runManager'],
    } satisfies Partial<ControlRouterContext> as unknown as ControlRouterContext;
    await handleSecretsApi(mockContext, new URLSearchParams(), 'GET', {} as unknown as IncomingMessage, mockResponse);
    expect(statusCode).toBe(503);
    expect(JSON.parse(responseBody).error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
