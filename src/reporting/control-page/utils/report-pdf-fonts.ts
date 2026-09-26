import type { jsPDF } from 'jspdf';
import { NOTO_SANS_REGULAR_BASE64 } from '../assets/fonts/noto-sans-regular-base64.js';
import { NOTO_SANS_BOLD_BASE64 } from '../assets/fonts/noto-sans-bold-base64.js';

export const REPORT_PDF_FONT_FAMILY = 'NotoSans';
export const NOTO_SANS_REGULAR_FILE = 'NotoSans-Regular.ttf';
export const NOTO_SANS_BOLD_FILE = 'NotoSans-Bold.ttf';

export function registerReportPdfFonts(doc: jsPDF): void {
  doc.addFileToVFS(NOTO_SANS_REGULAR_FILE, NOTO_SANS_REGULAR_BASE64);
  doc.addFont(NOTO_SANS_REGULAR_FILE, REPORT_PDF_FONT_FAMILY, 'normal');

  doc.addFileToVFS(NOTO_SANS_BOLD_FILE, NOTO_SANS_BOLD_BASE64);
  doc.addFont(NOTO_SANS_BOLD_FILE, REPORT_PDF_FONT_FAMILY, 'bold');
}
