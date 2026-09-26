import { jsPDF } from 'jspdf';
import { extractReportPdfContent } from './report-pdf-content.js';
import { registerReportPdfFonts } from './report-pdf-fonts.js';
import { loadReportImage } from './report-pdf-image-loader.js';
import { layoutReportPdfDocument } from './report-pdf-layout.js';

export interface ExportReportPdfOptions {
  readonly projectId: string;
  readonly runId: string;
}

export interface ExportReportPdfResult {
  readonly filename: string;
  readonly blob: Blob;
  readonly pageCount: number;
}

export function buildReportPdfFilename(projectId: string, runId: string): string {
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeRun = runId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeProject}-${safeRun}-report.pdf`;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // Revoke object URL after browser handoff (60s buffer)
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }
}

export async function exportReportPdf(
  container: HTMLElement,
  options: ExportReportPdfOptions,
): Promise<ExportReportPdfResult> {
  const content = extractReportPdfContent(container);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  registerReportPdfFonts(doc);

  await layoutReportPdfDocument(doc, content, loadReportImage);

  const blob = doc.output('blob');
  const filename = buildReportPdfFilename(options.projectId, options.runId);
  const pageCount = doc.getNumberOfPages();

  triggerBrowserDownload(blob, filename);

  return { filename, blob, pageCount };
}
