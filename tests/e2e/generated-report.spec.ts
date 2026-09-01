import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

import { createGeneratedReportFixture } from './generated-report-fixtures.js';
const RUN_ID = '20260824t040000z-0000000000000042';

let fixture: Awaited<ReturnType<typeof createGeneratedReportFixture>>;

test.describe('generated offline reports', () => {
  test.beforeAll(async () => { fixture = await createGeneratedReportFixture(); });
  test.afterAll(async () => { await fixture.close(); });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${fixture.baseUrl}${fixture.reportPath}`, { waitUntil: 'networkidle' });
  });

  test('renders at the report nesting depth with local assets and restrictive CSP', async ({ page }) => {
    const response = await page.request.get(`${fixture.baseUrl}${fixture.reportPath}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    await expect(page).toHaveTitle('Service <A> vulnerability report');
    await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', '../../assets/report.css');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Snyk test report' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overall and Issues evidence' })).toBeVisible();
    expect(await page.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const html = await page.content();
    expect(html).not.toMatch(/<script\b|javascript:/iu);
    expect(await page.locator('*').evaluateAll((elements) => elements.some((element) => [...element.attributes].some((attribute) => attribute.name.toLowerCase().startsWith('on'))))).toBe(false);
  });

  test('keeps every local link resolvable and every external link safe', async ({ page, request }) => {
    const links = await page.locator('a[href]').evaluateAll((elements) => elements.map((element) => ({
      href: (element as HTMLAnchorElement).href,
      target: element.getAttribute('target'),
      rel: element.getAttribute('rel'),
    })));
    for (const link of links) {
      const url = new URL(link.href);
      if (url.hash && url.origin === fixture.baseUrl && url.pathname === new URL(page.url()).pathname) continue;
      if (url.origin === fixture.baseUrl) {
        expect(url.pathname).not.toContain('..');
        expect((await request.get(link.href)).status()).toBe(200);
      } else {
        expect(['http:', 'https:']).toContain(url.protocol);
        expect(url.username).toBe('');
        expect(url.password).toBe('');
        expect(link.target).toBe('_blank');
        expect(link.rel?.split(/\s+/u)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
      }
    }
  });

  test('supports keyboard traversal and has no WCAG A/AA axe violations', async ({ page }) => {
    const linkCount = await page.locator('a[href]').count();
    for (let index = 0; index < linkCount; index += 1) {
      await page.keyboard.press('Tab');
      await expect(page.locator('a:focus-visible')).toHaveCount(1);
    }
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('does not overflow the viewport and preserves fixed desktop/mobile visuals', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.reload({ waitUntil: 'networkidle' });
      const dimensions = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveScreenshot('generated-report-desktop.png', { fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveScreenshot('generated-report-mobile.png', { fullPage: true, animations: 'disabled' });
  });

  test('keeps the aggregate index linkable from the same HTTP server', async ({ page, request }) => {
    await page.goto(`${fixture.baseUrl}/reports/index.html`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Vulnerability report index' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Run' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Job ID' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Branch' })).toBeVisible();
    const runRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: RUN_ID }) });
    await expect(runRow).toContainText('job-id');
    await expect(runRow).toContainText('release/sit');
    const reportLink = page.getByRole('link', { name: 'Open current report' });
    await expect(reportLink).toHaveAttribute('href', 'service-a/20260824t040000z-0000000000000042/index.html');
    expect((await request.get(new URL(await reportLink.getAttribute('href') ?? '', page.url()).toString())).status()).toBe(200);
    await reportLink.click();
    await expect(page).toHaveTitle('Service <A> vulnerability report');
    await expect(page.getByRole('heading', { name: 'Snyk test report' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overall and Issues evidence' })).toBeVisible();
  });
});
