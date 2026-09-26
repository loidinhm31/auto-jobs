import { jsPDF } from 'jspdf';
import { applyPlugin, type CellHookData } from 'jspdf-autotable';
import type { ReportPdfTableBlock, ReportPdfTableCell } from '../types/report-pdf-types.js';
import {
  PAGE_MARGIN_MM,
  PDF_COLORS,
  PDF_FONT_SIZES,
  PT_TO_MM,
} from './report-pdf-constants.js';
import { REPORT_PDF_FONT_FAMILY } from './report-pdf-fonts.js';

// Ensure the autoTable plugin is attached to jsPDF
applyPlugin(jsPDF);

interface RenderTableResult {
  finalY: number;
}
function extractTableCellData(raw: unknown): ReportPdfTableCell | undefined {
  if (typeof raw === 'object' && raw !== null) {
    if ('text' in raw && 'spans' in raw) {
      return raw as ReportPdfTableCell;
    }
    if ('raw' in raw && typeof raw.raw === 'object' && raw.raw !== null && 'text' in raw.raw && 'spans' in raw.raw) {
      return raw.raw as ReportPdfTableCell;
    }
  }
  return undefined;
}

export function renderReportPdfTable(
  doc: jsPDF,
  tableBlock: ReportPdfTableBlock,
  startY: number,
): RenderTableResult {
  let currentY = startY;
  if (tableBlock.caption) {
    doc.setFont(REPORT_PDF_FONT_FAMILY, 'bold');
    doc.setFontSize(PDF_FONT_SIZES.small);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(tableBlock.caption, PAGE_MARGIN_MM, currentY, { baseline: 'top' });
    currentY += 5;
  }

  const isFindings = tableBlock.variant === 'findings';
  const isCompact = tableBlock.variant === 'compact';
  const fontSize = isFindings ? PDF_FONT_SIZES.tableFloor : PDF_FONT_SIZES.tableDefault;

  const columnStyles: Record<number, { cellWidth?: number; halign?: 'left' | 'center' | 'right' }> = {};
  if (isFindings) {
    columnStyles[0] = { cellWidth: 22 };
    columnStyles[1] = { cellWidth: 32 };
    columnStyles[2] = { cellWidth: 16, halign: 'center' };
    columnStyles[3] = { cellWidth: 22 };
    columnStyles[4] = { cellWidth: 28 };
    columnStyles[5] = { cellWidth: 32 };
    columnStyles[6] = { cellWidth: 38 };
  } else if (isCompact) {
    columnStyles[0] = { cellWidth: 60 };
    columnStyles[1] = { cellWidth: 35, halign: 'right' };
  }

  const head = tableBlock.headers.length > 0 ? [tableBlock.headers.slice()] : [];
  const body = tableBlock.rows.map((row) =>
    row.map((cell) => ({
      content: cell.text,
      raw: cell,
    })),
  );

  doc.autoTable({
    head,
    body,
    startY: currentY,
    tableWidth: isCompact ? 'wrap' : 'auto',
    margin: { left: PAGE_MARGIN_MM, right: PAGE_MARGIN_MM },
    theme: 'grid',
    styles: {
      font: REPORT_PDF_FONT_FAMILY,
      fontSize,
      cellPadding: 1.8,
      overflow: 'linebreak',
      textColor: PDF_COLORS.textPrimary,
      lineColor: PDF_COLORS.borderGray,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: PDF_COLORS.headerFill,
      textColor: PDF_COLORS.textPrimary,
      fontStyle: 'bold',
      lineColor: PDF_COLORS.borderGray,
      lineWidth: 0.2,
    },
    columnStyles,
    didDrawCell: (data: CellHookData) => {
      if (data.section === 'body') {
        const rawCell = extractTableCellData(data.cell.raw);
        if (!rawCell?.spans) return;

        const links = rawCell.spans.filter((s) => s.link?.isExternal).map((s) => s.link!);
        if (links.length === 0) return;

        const cellX = data.cell.x + data.cell.padding('left');
        const cellY = data.cell.y + data.cell.padding('top');
        const cellWidth = data.cell.width - data.cell.padding('left') - data.cell.padding('right');
        const lineHeight = data.cell.styles.fontSize * 1.15 * PT_TO_MM;

        let lineIdx = 0;
        for (const link of links) {
          if (link.href) {
            const lineTop = cellY + lineIdx * lineHeight;
            doc.link(cellX, lineTop, cellWidth, lineHeight, { url: link.href });
          }
          lineIdx++;
        }
      }
    },
  });

  const finalY = doc.lastAutoTable?.finalY ?? currentY + 20;
  return { finalY };
}
