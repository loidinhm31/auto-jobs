import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

import { expect, test } from '@playwright/test';

const TEMPLATE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates');

function contentType(filename: string): string {
  return filename.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
}

async function startTemplateServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const rootStat = await fs.lstat(TEMPLATE_ROOT);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('template root must be a real directory');
  const root = await fs.realpath(TEMPLATE_ROOT);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://template-fixture').pathname);
      const relative = pathname.replace(/^\/+/, '');
      const filename = path.resolve(root, relative);
      if (filename === root || !filename.startsWith(`${root}${path.sep}`)) {
        response.writeHead(400).end();
        return;
      }
      const fileStat = await fs.lstat(filename);
      const realFilename = await fs.realpath(filename);
      if (!fileStat.isFile() || fileStat.isSymbolicLink() || realFilename !== filename) {
        response.writeHead(404).end('not found');
        return;
      }
      const body = await fs.readFile(filename);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'none'",
        'content-type': contentType(filename),
      }).end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

const TEMPLATE_PAGES = [
  { key: 'jenkins', path: 'jenkins-template/template.html' },
  { key: 'snyk', path: 'snyk-template/template.html' },
  { key: 'sonarqube-home', path: 'sonarqube-template/template-home.html' },
  { key: 'sonarqube-overall', path: 'sonarqube-template/template-overall.html' },
  { key: 'sonarqube-issues', path: 'sonarqube-template/template-issues.html' },
] as const;

const NAVIGATION = [
  { key: 'jenkins', name: 'Jenkins hub', path: 'jenkins-template/template.html' },
  { key: 'snyk', name: 'Snyk report', path: 'snyk-template/template.html' },
  { key: 'sonarqube-home', name: 'SonarQube home', path: 'sonarqube-template/template-home.html' },
  { key: 'sonarqube-overall', name: 'SonarQube overall', path: 'sonarqube-template/template-overall.html' },
  { key: 'sonarqube-issues', name: 'SonarQube issues', path: 'sonarqube-template/template-issues.html' },
] as const;

test('uses the Jenkins template as the report hub and follows every vendor page link', async ({ page }) => {
  const fixture = await startTemplateServer();
  await page.context().route('https://**/*', (route) => route.abort());
  let popupCount = 0;
  page.on('popup', () => { popupCount += 1; });
  try {
    for (const template of TEMPLATE_PAGES) {
      const response = await page.goto(`${fixture.origin}/${template.path}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), template.path).toBe(200);
      expect(response?.headers()['content-security-policy'], template.path).toBe("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'none'");
      const navigation = page.getByRole('navigation', { name: 'Vulnerability reports' });
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link')).toHaveCount(NAVIGATION.length);
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(navigation.getByRole('link', { name: NAVIGATION.find((link) => link.key === template.key)!.name, exact: true })).toHaveAttribute('aria-current', 'page');
      for (const linkInfo of NAVIGATION) {
        const link = navigation.getByRole('link', { name: linkInfo.name, exact: true });
        await expect(link).toHaveAttribute('target', '_self');
        await expect(link).toHaveAttribute('data-template-target', linkInfo.key);
        const href = await link.getAttribute('href');
        const resolved = new URL(href!, page.url());
        expect(resolved.origin, `${template.path} -> ${linkInfo.path}`).toBe(fixture.origin);
        expect(resolved.pathname).toBe(`/${linkInfo.path}`);
        const linkResponse = await page.request.get(resolved.toString(), { maxRedirects: 0 });
        expect(linkResponse.status(), `${template.path} -> ${linkInfo.path}`).toBe(200);
      }
    }

    await page.goto(`${fixture.origin}/jenkins-template/template.html`, { waitUntil: 'domcontentloaded' });
    let navigation = page.getByRole('navigation', { name: 'Vulnerability reports' });
    await navigation.getByRole('link', { name: 'Snyk report', exact: true }).click();
    await expect(page).toHaveURL(/\/snyk-template\/template\.html$/);
    navigation = page.getByRole('navigation', { name: 'Vulnerability reports' });
    await expect(navigation.getByRole('link', { name: 'Snyk report', exact: true })).toHaveAttribute('aria-current', 'page');

    await navigation.getByRole('link', { name: 'SonarQube home', exact: true }).click();
    await expect(page).toHaveURL(/\/sonarqube-template\/template-home\.html$/);
    navigation = page.getByRole('navigation', { name: 'Vulnerability reports' });
    await expect(navigation.getByRole('link', { name: 'SonarQube home', exact: true })).toHaveAttribute('aria-current', 'page');

    await navigation.getByRole('link', { name: 'SonarQube overall', exact: true }).click();
    await expect(page).toHaveURL(/\/sonarqube-template\/template-overall\.html$/);
    navigation = page.getByRole('navigation', { name: 'Vulnerability reports' });
    await navigation.getByRole('link', { name: 'SonarQube issues', exact: true }).click();
    await expect(page).toHaveURL(/\/sonarqube-template\/template-issues\.html$/);

    navigation = page.getByRole('navigation', { name: 'Vulnerability reports' });
    await navigation.getByRole('link', { name: 'Jenkins hub', exact: true }).click();
    await expect(page).toHaveURL(/\/jenkins-template\/template\.html$/);
    expect(popupCount).toBe(0);
  } finally {
    await page.context().unroute('https://**/*');
    await fixture.close();
  }
});
