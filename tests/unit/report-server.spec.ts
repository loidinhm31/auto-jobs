import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { createReportServer } from '../../src/reporting/report-server.js';
import { parseReportServerArgs } from '../../src/reporting/report-server-cli.js';

function rawStatus(port: number, requestPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: requestPath, method: 'GET' }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    request.once('error', reject);
    request.end();
  });
}

test('serves the project report root in a browser without exposing unsafe paths', async ({ page }) => {
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-server-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-server-outside-'));
  const symlinkRoot = path.join(reportRoot, 'linked-report.txt');
  try {
    fs.mkdirSync(path.join(reportRoot, 'assets'));
    fs.mkdirSync(path.join(reportRoot, 'service-a', 'run-20260831'), { recursive: true });
    fs.writeFileSync(path.join(reportRoot, 'index.html'), '<!doctype html><title>Vulnerability report index</title><h1>Project report</h1>');
    fs.writeFileSync(path.join(reportRoot, 'assets', 'report.css'), 'body { color: #123456; }');
    fs.writeFileSync(path.join(reportRoot, 'service-a', 'run-20260831', 'data.json'), '{"state":"partial"}');
    fs.writeFileSync(path.join(reportRoot, 'service-a', 'run-20260831', 'snapshot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(outsideRoot, 'secret.txt'), 'private outside content');
    fs.symlinkSync(path.join(outsideRoot, 'secret.txt'), symlinkRoot);

    const server = await createReportServer(reportRoot, { host: '127.0.0.1', port: 0 });
    try {
      const response = await page.goto(server.url);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
      await expect(page).toHaveTitle('Vulnerability report index');
      await expect(page.locator('h1')).toHaveText('Project report');

      const stylesheet = await page.request.get(`${server.url}assets/report.css`);
      expect(stylesheet.status()).toBe(200);
      expect(stylesheet.headers()['content-type']).toContain('text/css');
      expect(await stylesheet.text()).toContain('#123456');

      const nestedJson = await page.request.get(`${server.url}service-a/run-20260831/data.json`);
      expect(nestedJson.status()).toBe(200);
      expect(nestedJson.headers()['content-type']).toContain('application/json');
      expect(await nestedJson.json()).toEqual({ state: 'partial' });
      expect((await page.request.get(`${server.url}service-a/run-20260831/`)).status()).toBe(404);
      expect((await page.request.get(`${server.url}service-a/run-20260831/snapshot.png`)).status()).toBe(200);

      const head = await page.request.fetch(`${server.url}index.html`, { method: 'HEAD' });
      expect(head.status()).toBe(200);
      expect(await head.body()).toHaveLength(0);
      expect((await page.request.get(`${server.url}linked-report.txt`)).status()).toBe(404);
      expect(await rawStatus(server.port, '/../secret.txt')).toBe(400);
      expect((await page.request.get(`${server.url}%2e%2e%2fsecret.txt`)).status()).toBe(400);
      expect((await page.request.get(`${server.url}%252e%252e%2fsecret.txt`)).status()).toBe(400);
      expect((await page.request.post(server.url)).status()).toBe(405);
    } finally {
      await Promise.all([server.close(), server.close()]);
    }
  } finally {
    fs.rmSync(reportRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('supports explicit LAN binding and project-local defaults', async () => {
  const options = parseReportServerArgs(
    ['--host', '0.0.0.0', '--allow-lan', '--port', '4180', '--root', 'reports'],
    { REPORT_HOST: '127.0.0.1', REPORT_PORT: '4173', REPORT_ROOT: 'ignored' },
  );
  expect(options).toEqual({
    root: path.resolve('reports'),
    configRoot: path.resolve('config'),
    host: '0.0.0.0',
    port: 4180,
    allowLan: true,
    mode: 'report',
    help: false,
  });
});

test('supports CLI flags for --env, --headless, and --executable-path', async () => {
  const options = parseReportServerArgs([
    '--control',
    '--env', 'CUSTOM_VAR=custom_val',
    '--headless=false',
    '--executable-path', 'C:\\browsers\\chrome.exe',
  ]);
  expect(options.mode).toBe('control');
  expect(options.envOverrides).toEqual({
    CUSTOM_VAR: 'custom_val',
    PLAYWRIGHT_HEADLESS: 'false',
    PLAYWRIGHT_EXECUTABLE_PATH: 'C:\\browsers\\chrome.exe',
  });

  const headlessTrue = parseReportServerArgs(['--headless']);
  expect(headlessTrue.envOverrides).toEqual({
    PLAYWRIGHT_HEADLESS: 'true',
  });
});

test('validates --env and --headless CLI arguments', async () => {
  expect(() => parseReportServerArgs(['--env', 'bad'])).toThrow(/--env requires NAME=VALUE/iu);
  expect(() => parseReportServerArgs(['--env', '123_INVALID=val'])).toThrow(/--env name is invalid/iu);
  expect(() => parseReportServerArgs(['--headless=invalid_bool'])).toThrow(/--headless must be true or false/iu);
  expect(() => parseReportServerArgs(['--executable-path'])).toThrow(/--executable-path requires a value/iu);
});

test('rejects a symlinked report root', async () => {
  const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-server-real-'));
  const parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-server-link-'));
  const linkedRoot = path.join(parentRoot, 'reports');
  try {
    fs.symlinkSync(realRoot, linkedRoot, 'dir');
    await expect(createReportServer(linkedRoot, { port: 0 })).rejects.toThrow(/real directory/iu);
  } finally {
    fs.rmSync(parentRoot, { recursive: true, force: true });
    fs.rmSync(realRoot, { recursive: true, force: true });
  }
});

test('requires an explicit opt-in for non-loopback binding', async () => {
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-server-lan-'));
  try {
    fs.writeFileSync(path.join(reportRoot, 'index.html'), '<title>Vulnerability report index</title>');
    await expect(createReportServer(reportRoot, { host: '0.0.0.0', port: 0 })).rejects.toThrow(/allow-lan/iu);
    const server = await createReportServer(reportRoot, { host: '0.0.0.0', port: 0, allowLan: true });
    await server.close();
  } finally {
    fs.rmSync(reportRoot, { recursive: true, force: true });
  }
});

test('accepts a generated aggregate index larger than the marker scan prefix', async () => {
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-server-large-index-'));
  try {
    fs.writeFileSync(path.join(reportRoot, 'index.html'), `<title>Vulnerability report index</title>${'x'.repeat(128 * 1_024)}`);
    const server = await createReportServer(reportRoot, { port: 0 });
    try {
      expect((await pageRequest(server.url)).status()).toBe(200);
    } finally {
      await server.close();
    }
  } finally {
    fs.rmSync(reportRoot, { recursive: true, force: true });
  }
});

async function pageRequest(url: string): Promise<{ status(): number }> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.once('end', () => resolve({ status: () => response.statusCode ?? 0 }));
    });
    request.once('error', reject);
  });
}
