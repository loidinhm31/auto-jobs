import type { jsPDF } from 'jspdf';
import type { ReportPdfTextSpan } from '../types/report-pdf-types.js';
import {
  PDF_COLORS,
  PDF_FONT_SIZES,
  PT_TO_MM,
} from './report-pdf-constants.js';
import { REPORT_PDF_FONT_FAMILY } from './report-pdf-fonts.js';

export interface PendingInternalLink {
  readonly pageNumber: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchorId: string;
}

export interface DrawSpansResult {
  readonly finalY: number;
  readonly pendingLinks: readonly PendingInternalLink[];
}

export function drawTextSpans(
  doc: jsPDF,
  spans: readonly ReportPdfTextSpan[],
  startX: number,
  startY: number,
  maxWidth: number,
  options?: {
    fontSize?: number;
    color?: readonly [number, number, number];
    lineHeightFactor?: number;
  },
): DrawSpansResult {
  const fontSize = options?.fontSize ?? PDF_FONT_SIZES.body;
  const defaultColor = options?.color ?? PDF_COLORS.textPrimary;
  const lineFactor = options?.lineHeightFactor ?? 1.35;
  const lineHeight = fontSize * lineFactor * PT_TO_MM;

  let currentX = startX;
  let currentY = startY;
  const pendingLinks: PendingInternalLink[] = [];

  doc.setFontSize(fontSize);

  for (const span of spans) {
    const isBold = span.isBold ?? false;
    const isCode = span.isCode ?? false;
    const fontStyle = isBold || isCode ? 'bold' : 'normal';
    doc.setFont(REPORT_PDF_FONT_FAMILY, fontStyle);

    if (span.link) {
      doc.setTextColor(...PDF_COLORS.linkBlue);
    } else if (span.isBadge) {
      doc.setTextColor(...PDF_COLORS.textPrimary);
    } else {
      doc.setTextColor(...defaultColor);
    }

    // Split text into words or explicit newlines
    const rawLines = span.text.split('\n');
    for (let l = 0; l < rawLines.length; l++) {
      if (l > 0) {
        currentX = startX;
        currentY += lineHeight;
      }

      const segment = rawLines[l] ?? '';
      if (segment.length === 0) continue;

      const words = segment.split(/(\s+)/);
      for (const word of words) {
        if (word.length === 0) continue;
        const wordWidth = doc.getTextWidth(word);

        if (currentX + wordWidth > startX + maxWidth && currentX > startX) {
          currentX = startX;
          currentY += lineHeight;
        }

        // Draw badge background if needed
        if (span.isBadge) {
          doc.setFillColor(...PDF_COLORS.badgeNeutral);
          doc.roundedRect(currentX - 0.5, currentY - 0.5, wordWidth + 1, fontSize * PT_TO_MM + 1, 1, 1, 'F');
        }

        doc.text(word, currentX, currentY, { baseline: 'top' });

        // Register link if span has link
        if (span.link) {
          const linkH = fontSize * PT_TO_MM;
          if (span.link.isExternal) {
            doc.link(currentX, currentY, wordWidth, linkH, { url: span.link.href });
          } else {
            const anchorId = span.link.href.replace(/^#/, '');
            pendingLinks.push({
              pageNumber: doc.getNumberOfPages(),
              x: currentX,
              y: currentY,
              width: wordWidth,
              height: linkH,
              anchorId,
            });
          }
        }

        currentX += wordWidth;
      }
    }
  }

  return {
    finalY: currentY + lineHeight,
    pendingLinks,
  };
}
