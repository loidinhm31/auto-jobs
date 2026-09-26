import { expect, test } from '@playwright/test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildReportPdfFilename,
  exportReportPdf,
} from '../../src/reporting/control-page/utils/export-report-pdf.js';
import { ReportExportButton } from '../../src/reporting/control-page/components/molecules/ReportExportButton.js';
import { elem } from './helpers/mock-dom-element.js';

test.describe('use-report-pdf-export & export orchestration', () => {
  test.describe('buildReportPdfFilename', () => {
    test('constructs standard <projectId>-<runId>-report.pdf filename', () => {
      const filename = buildReportPdfFilename('service-a', '20260926_000000');
      expect(filename).toBe('service-a-20260926_000000-report.pdf');
    });

    test('sanitizes unsafe path characters into underscores', () => {
      const filename = buildReportPdfFilename('service/a:test', '2026-09-26 12:00:00');
      expect(filename).toBe('service_a_test-2026-09-26_12_00_00-report.pdf');
      expect(filename.endsWith('-report.pdf')).toBe(true);
    });
  });

  test.describe('exportReportPdf', () => {
    test('generates valid PDF blob and filename from report DOM container', async () => {
      const root = elem('div', { id: 'project-report-surface' }, [
        elem('h1', {}, ['Service A Vulnerability Report']),
        elem('p', {}, ['Test export paragraph content.']),
      ]);

      const result = await exportReportPdf(root as unknown as HTMLElement, {
        projectId: 'service-a',
        runId: 'run-1',
      });

      expect(result.filename).toBe('service-a-run-1-report.pdf');
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
      expect(result.blob).toBeDefined();
      expect(result.blob.size).toBeGreaterThan(1000);
      expect(result.blob.type).toBe('application/pdf');
    });
  });

  test.describe('ReportExportButton UI states', () => {
    test('renders disabled button when not ready', () => {
      const html = renderToStaticMarkup(
        React.createElement(ReportExportButton, {
          projectId: 'service-a',
          runId: 'run-1',
          isReady: false,
          getReportElement: () => null,
        }),
      );

      expect(html).toContain('id="export-pdf-button"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('Export PDF');
      expect(html).toContain('cursor-not-allowed');
    });

    test('renders active button when ready', () => {
      const html = renderToStaticMarkup(
        React.createElement(ReportExportButton, {
          projectId: 'service-a',
          runId: 'run-1',
          isReady: true,
          getReportElement: () => null,
        }),
      );

      expect(html).toContain('id="export-pdf-button"');
      expect(html).not.toContain('disabled=""');
      expect(html).toContain('Export PDF');
      expect(html).toContain('cursor-pointer');
    });
  });
});
