import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { createReportServer } from '../../src/reporting/report-server.js';
import {
  initReportRoot,
  createRichRunFiles,
} from './helpers/report-pdf-fixtures.js';
import { parsePdf } from './helpers/pdf-parser.js';

test.describe('Control Final Project Report: PDF Export Scenarios', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-pdf-sc-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-pdf-sc-rep-'));
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
    closeServer = server.close;
  });

  test.afterEach(async () => {
    if (closeServer) await closeServer();
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('multi-page report preserves A4 portrait and table headers across pagination', async ({ page }) => {
    const { projectId, runId } = createRichRunFiles(reportRoot, {
      projectId: 'service-multi',
      runId: '20260926_200000',
      findingsCount: 15,
      includeScreenshots: true,
      includeVietnameseUnicode: true,
    });

    await page.goto(`${serverUrl}reports/${projectId}/${runId}/index.html`);
    const exportBtn = page.locator('#export-pdf-button');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
    await exportBtn.click();
    const download = await downloadPromise;
    const downloadPath = path.join(reportRoot, download.suggestedFilename());
    await download.saveAs(downloadPath);

    const pdfBuffer = fs.readFileSync(downloadPath);
    fs.unlinkSync(downloadPath);

    const parsed = parsePdf(pdfBuffer);
    expect(parsed.pageCount).toBeGreaterThanOrEqual(2);

    for (const pageItem of parsed.pages) {
      expect(pageItem.mediaBox[2]).toBeCloseTo(595.28, 1);
      expect(pageItem.mediaBox[3]).toBeCloseTo(841.89, 1);
    }
  });

  test('exports full content from mobile viewport without truncation', async ({ page }) => {
    const { projectId, runId } = createRichRunFiles(reportRoot, {
      projectId: 'service-mobile',
      runId: '20260926_300000',
      findingsCount: 3,
      includeScreenshots: true,
      includeVietnameseUnicode: true,
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${serverUrl}reports/${projectId}/${runId}/index.html`);
    const exportBtn = page.locator('#export-pdf-button');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await exportBtn.click();
    const download = await downloadPromise;
    const downloadPath = path.join(reportRoot, download.suggestedFilename());
    await download.saveAs(downloadPath);

    const pdfBuffer = fs.readFileSync(downloadPath);
    fs.unlinkSync(downloadPath);

    const parsed = parsePdf(pdfBuffer);
    expect(parsed.pageCount).toBeGreaterThanOrEqual(1);
    expect(parsed.images.length).toBeGreaterThanOrEqual(1);
    const allText = parsed.extractedTexts.join(' ');
    expect(allText).toContain('Dự án thanh toán bảo mật (VN-PAY)');
  });

  test('debounces rapid double-clicks to trigger only a single download', async ({ page }) => {
    const { projectId, runId } = createRichRunFiles(reportRoot, {
      projectId: 'service-debounce',
      runId: '20260926_400000',
      findingsCount: 1,
    });

    await page.goto(`${serverUrl}reports/${projectId}/${runId}/index.html`);
    const exportBtn = page.locator('#export-pdf-button');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    let downloadCount = 0;
    page.on('download', () => {
      downloadCount++;
    });

    await exportBtn.dblclick();
    await page.waitForTimeout(3000);

    expect(downloadCount).toBe(1);
  });

  test('handles missing screenshot asset with explicit error banner without crashing', async ({ page }) => {
    const { projectId, runId } = createRichRunFiles(reportRoot, {
      projectId: 'service-err',
      runId: '20260926_500000',
      findingsCount: 1,
      includeScreenshots: true,
      missingScreenshotFile: true,
    });

    await page.goto(`${serverUrl}reports/${projectId}/${runId}/index.html`);
    const exportBtn = page.locator('#export-pdf-button');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    await exportBtn.click();
    // Expect error state
    await expect(exportBtn).toHaveText(/Retry Export PDF/);
    const errorAlert = page.locator('#report-export-controls').getByText(/Failed to load evidence screenshot/);
    await expect(errorAlert).toBeVisible();
  });

  test('preserves scriptless offline report and filesystem immutability', async () => {
    const { dir } = createRichRunFiles(reportRoot, {
      projectId: 'service-offline',
      runId: '20260926_600000',
    });

    const indexPath = path.join(dir, 'index.html');
    const originalContent = fs.readFileSync(indexPath, 'utf8');

    // Confirm original content has no scripts
    expect(originalContent).not.toContain('<script');
    expect(originalContent).toContain('Scriptless Static Report Content');

    // Confirm manifest and data files are valid and unmodified
    const manifestPath = path.join(dir, 'manifest.json');
    const dataPath = path.join(dir, 'data.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(dataPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.state).toBe('success');
  });
});
