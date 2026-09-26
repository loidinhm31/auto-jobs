import { expect, test } from '@playwright/test';
import { jsPDF } from 'jspdf';
import {
  registerReportPdfFonts,
  REPORT_PDF_FONT_FAMILY,
  NOTO_SANS_REGULAR_FILE,
  NOTO_SANS_BOLD_FILE,
} from '../../src/reporting/control-page/utils/report-pdf-fonts.js';

test.describe('report-pdf-fonts', () => {
  test('registers NotoSans regular and bold fonts in jsPDF VFS', () => {
    const doc = new jsPDF();
    registerReportPdfFonts(doc);

    expect(doc.existsFileInVFS(NOTO_SANS_REGULAR_FILE)).toBe(true);
    expect(doc.existsFileInVFS(NOTO_SANS_BOLD_FILE)).toBe(true);

    // Can set font and render text including Vietnamese and special characters
    doc.setFont(REPORT_PDF_FONT_FAMILY, 'normal');
    expect(doc.getFont().fontName).toBe(REPORT_PDF_FONT_FAMILY);

    doc.setFont(REPORT_PDF_FONT_FAMILY, 'bold');
    expect(doc.getFont().fontName).toBe(REPORT_PDF_FONT_FAMILY);

    doc.text('Báo cáo bảo mật: SonarQube & Snyk — Vulnerability Evidence', 10, 10);
    const output = doc.output();
    expect(output.length).toBeGreaterThan(1000);
  });
});
