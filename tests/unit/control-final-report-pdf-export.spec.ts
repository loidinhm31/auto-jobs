import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { createReportServer } from '../../src/reporting/report-server.js';
import {
  initReportRoot,
  createRichRunFiles,
  FIXTURE_JENKINS_URL,
  FIXTURE_SNYK_LIVE_URL,
  FIXTURE_SONAR_HOME_URL,
  FIXTURE_SONAR_OVERALL_URL,
  FIXTURE_SONAR_ISSUES_URL,
} from './helpers/report-pdf-fixtures.js';
import { parsePdf } from './helpers/pdf-parser.js';

test.describe('Control Final Project Report: Core PDF Export', () => {
  let configRoot: string;
  let reportRoot: string;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-pdf-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-pdf-rep-'));
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

  test('renders ReportExportButton and initiates download with correct filename', async ({ page }) => {
    const { projectId, runId } = createRichRunFiles(reportRoot, { projectId: 'service-a', runId: 'run-1' });

    await page.goto(`${serverUrl}reports/${projectId}/${runId}/index.html`);
    const exportBtn = page.locator('#export-pdf-button');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();
    await expect(exportBtn).toHaveText(/Export PDF/);

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await exportBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('service-a-run-1-report.pdf');
  });

  test('exports complete PDF with selectable Unicode text, embedded screenshots, and clickable links', async ({ page }) => {
    const { projectId, runId } = createRichRunFiles(reportRoot, {
      projectId: 'service-vn',
      runId: '20260926_100000',
      findingsCount: 2,
      includeScreenshots: true,
      includeVietnameseUnicode: true,
      multipleLinksPerCell: true,
    });

    await page.goto(`${serverUrl}reports/${projectId}/${runId}/index.html`);
    const exportBtn = page.locator('#export-pdf-button');
    await expect(exportBtn).toBeVisible();

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await exportBtn.click();

    const download = await downloadPromise;
    const downloadPath = path.join(reportRoot, download.suggestedFilename());
    await download.saveAs(downloadPath);

    const pdfBuffer = fs.readFileSync(downloadPath);
    fs.unlinkSync(downloadPath);

    const parsed = parsePdf(pdfBuffer);

    // 1. Valid PDF header and A4 portrait dimensions
    expect(parsed.header).toMatch(/^%PDF-1\./);
    expect(parsed.pageCount).toBeGreaterThanOrEqual(1);
    for (const pageItem of parsed.pages) {
      expect(pageItem.mediaBox[2]).toBeCloseTo(595.28, 1);
      expect(pageItem.mediaBox[3]).toBeCloseTo(841.89, 1);
    }

    // 2. Embedded screenshots (Snyk, Sonar overall, Sonar issues)
    expect(parsed.images.length).toBeGreaterThanOrEqual(1);
    for (const img of parsed.images) {
      expect(img.width).toBe(320);
      expect(img.height).toBe(180);
    }

    // 3. Selectable text with Vietnamese Unicode characters
    const allText = parsed.extractedTexts.join(' ').replace(/\s+/g, ' ');
    expect(allText).toContain('Dự án thanh toán bảo mật (VN-PAY)');
    expect(allText).toContain('Lỗ hổng bảo mật thực thi mã từ xa');
    expect(allText).toContain('Nâng cấp phiên bản thư viện');
    expect(allText).toContain('Snyk test report');
    expect(allText).toContain('SonarQube Overall');
    expect(allText).toContain('Generated from normalized schema-v3 evidence');

    // 4. Clickable link annotations for Snyk, Sonar, Jenkins, and references
    const linkUrls = parsed.links.map((l) => l.url);
    expect(linkUrls).toContain(FIXTURE_JENKINS_URL);
    expect(linkUrls).toContain(FIXTURE_SNYK_LIVE_URL);
    expect(linkUrls).toContain(FIXTURE_SONAR_HOME_URL);
    expect(linkUrls).toContain(FIXTURE_SONAR_OVERALL_URL);
    expect(linkUrls).toContain(FIXTURE_SONAR_ISSUES_URL);
    expect(linkUrls.some((u) => u.includes('https://security.example/advisory/SNYK-JS-FIXTURE-001'))).toBe(true);
    expect(linkUrls.some((u) => u.includes('https://cve.mitre.org/cve/CVE-2026-1001'))).toBe(true);

    // 5. Distinct link rectangles for multiple links
    expect(parsed.links.length).toBeGreaterThanOrEqual(7);
  });
});
