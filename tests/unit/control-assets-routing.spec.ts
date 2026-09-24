import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  loadControlAssets,
  renderControlPageHtml,
  getControlCss,
  getControlJs,
  escapeHtml,
  _resetControlAssetsCache,
} from '../../src/reporting/report-server-control-page.js';
import { createReportServer } from '../../src/reporting/report-server.js';
import { CONTROL_CSP, REPORT_CSP, AGGREGATE_REPORT_MARKER } from '../../src/reporting/report-server-constants.js';

test.describe('Control Page Asset Routing & Build Output (Phase 01)', () => {
  test.beforeEach(() => {
    _resetControlAssetsCache();
  });

  test('loadControlAssets reads built assets from .runner-build/reporting/control-page', async () => {
    const assets = await loadControlAssets();

    expect(assets.html).toBeDefined();
    expect(assets.html).toContain('__CSRF_TOKEN_PLACEHOLDER__');
    expect(assets.html).toContain('<div id="root"></div>');
    expect(assets.html).toContain('/assets/control-page.js');
    expect(assets.html).toContain('/assets/control-page.css');

    expect(assets.css).toBeDefined();
    expect(assets.css.length).toBeGreaterThan(0);
    expect(assets.css).toContain('--primary');

    expect(assets.js).toBeDefined();
    expect(assets.js.length).toBeGreaterThan(0);
  });

  test('renderControlPageHtml properly injects and escapes CSRF tokens including special patterns', async () => {
    const rawToken = 'test-token-12345';
    const html = await renderControlPageHtml(rawToken);
    expect(html).toContain('<meta name="csrf-token" content="test-token-12345">');
    expect(html).not.toContain('__CSRF_TOKEN_PLACEHOLDER__');

    const unsafeToken = 'token"&<>\'injected';
    const escapedHtmlResult = await renderControlPageHtml(unsafeToken);
    expect(escapedHtmlResult).toContain(
      '<meta name="csrf-token" content="token&quot;&amp;&lt;&gt;&#39;injected">',
    );
    expect(escapedHtmlResult).not.toContain(unsafeToken);

    // Dollar sign patterns like $$, $&, $1 should not trigger special regex replacement
    const dollarToken = 'dollar$$and$&and$\'and$1token';
    const dollarResult = await renderControlPageHtml(dollarToken);
    expect(dollarResult).toContain(
      '<meta name="csrf-token" content="dollar$$and$&amp;and$&#39;and$1token">',
    );
  });

  test('getControlCss and getControlJs return valid non-empty assets', async () => {
    const css = await getControlCss();
    const js = await getControlJs();

    expect(typeof css).toBe('string');
    expect(css.length).toBeGreaterThan(100);

    expect(typeof js).toBe('string');
    expect(js.length).toBeGreaterThan(100);
  });

  test('control server serves index.html and assets with strict security headers', async ({ page }) => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-test-config-'));
    const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-test-report-'));
    fs.writeFileSync(
      path.join(configRoot, 'default.json'),
      JSON.stringify({ schemaVersion: 1, defaults: { artifactDir: reportRoot }, projects: [] }),
      'utf8',
    );

    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      // Test GET /
      const response = await page.goto(server.url);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-type']).toContain('text/html');
      expect(response?.headers()['content-security-policy']).toBe(CONTROL_CSP);

      const csrfMeta = page.locator('meta[name="csrf-token"]');
      await expect(csrfMeta).toHaveCount(1);
      const token = await csrfMeta.getAttribute('content');
      expect(token).toBeTruthy();
      expect(token).not.toBe('__CSRF_TOKEN_PLACEHOLDER__');

      // Test GET /assets/control-page.css
      const cssResponse = await page.request.get(`${server.url}assets/control-page.css`);
      expect(cssResponse.status()).toBe(200);
      expect(cssResponse.headers()['content-type']).toContain('text/css');
      expect(cssResponse.headers()['content-security-policy']).toBe(CONTROL_CSP);
      expect(cssResponse.headers()['cache-control']).toBe('no-store');

      // Test GET /assets/control-page.js
      const jsResponse = await page.request.get(`${server.url}assets/control-page.js`);
      expect(jsResponse.status()).toBe(200);
      expect(jsResponse.headers()['content-type']).toContain('application/javascript');
      expect(jsResponse.headers()['content-security-policy']).toBe(CONTROL_CSP);
      expect(jsResponse.headers()['cache-control']).toBe('no-store');
    } finally {
      await server.close();
      fs.rmSync(configRoot, { recursive: true, force: true });
      fs.rmSync(reportRoot, { recursive: true, force: true });
    }
  });

  test('control server serves /reports/index.html with control security headers and CSRF token on GET and HEAD', async ({ page }) => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-test-config-'));
    const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-test-report-'));
    fs.writeFileSync(
      path.join(configRoot, 'default.json'),
      JSON.stringify({ schemaVersion: 1, defaults: { artifactDir: reportRoot }, projects: [] }),
      'utf8',
    );

    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      // 1. GET /reports/index.html
      const getRes = await page.request.get(`${server.url}reports/index.html`);
      expect(getRes.status()).toBe(200);
      expect(getRes.headers()['content-type']).toContain('text/html');
      expect(getRes.headers()['content-security-policy']).toBe(CONTROL_CSP);
      expect(getRes.headers()['cache-control']).toBe('no-store');
      const getHtml = await getRes.text();
      expect(getHtml).toContain('<meta name="csrf-token" content="');
      expect(getHtml).not.toContain('__CSRF_TOKEN_PLACEHOLDER__');
      const reportedLength = parseInt(getRes.headers()['content-length'] ?? '0', 10);
      expect(reportedLength).toBe(Buffer.byteLength(getHtml));

      // 2. HEAD /reports/index.html
      const headRes = await page.request.head(`${server.url}reports/index.html`);
      expect(headRes.status()).toBe(200);
      expect(headRes.headers()['content-type']).toContain('text/html');
      expect(headRes.headers()['content-security-policy']).toBe(CONTROL_CSP);
      expect(headRes.headers()['content-length']).toBe(String(reportedLength));
      const headBody = await headRes.text();
      expect(headBody).toBe('');

      // 3. POST /reports/index.html returns 405 Method Not Allowed
      const postRes = await page.request.post(`${server.url}reports/index.html`);
      expect(postRes.status()).toBe(405);
      expect(postRes.headers()['allow']).toBe('GET, HEAD');

      fs.writeFileSync(
        path.join(reportRoot, 'index.html'),
        `<!doctype html><html><head>${AGGREGATE_REPORT_MARKER}<title>Static</title></head><body>Static Index</body></html>`,
        'utf8',
      );
      const reportModeServer = await createReportServer(reportRoot, {
        mode: 'report',
        host: '127.0.0.1',
        port: 0,
      });
      try {
        const reportRes = await page.request.get(`${reportModeServer.url}index.html`);
        expect(reportRes.status()).toBe(200);
        expect(reportRes.headers()['content-security-policy']).toBe(REPORT_CSP);
        const reportBody = await reportRes.text();
        expect(reportBody).toContain('Static Index');
        expect(reportBody).not.toContain('<meta name="csrf-token"');
      } finally {
        await reportModeServer.close();
      }
    } finally {
      await server.close();
      fs.rmSync(configRoot, { recursive: true, force: true });
      fs.rmSync(reportRoot, { recursive: true, force: true });
    }
  });
});
