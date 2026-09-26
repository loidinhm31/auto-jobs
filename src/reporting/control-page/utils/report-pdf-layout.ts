import type { jsPDF } from 'jspdf';
import type {
  ExtractedReportPdfContent,
  ReportPdfDefinitionListBlock,
  ReportPdfFigureBlock,
  ReportPdfHeadingBlock,
  ReportPdfListBlock,
  ReportPdfParagraphBlock,
} from '../types/report-pdf-types.js';
import {
  A4_PORTRAIT_HEIGHT_MM,
  PAGE_MARGIN_MM,
  PDF_COLORS,
  PDF_FONT_SIZES,
  USABLE_WIDTH_PORTRAIT_MM,
} from './report-pdf-constants.js';
import { REPORT_PDF_FONT_FAMILY } from './report-pdf-fonts.js';
import type { DecodedReportPdfImage } from './report-pdf-image-loader.js';
import { drawTextSpans, type PendingInternalLink } from './report-pdf-span-renderer.js';
import { renderReportPdfTable } from './report-pdf-table-renderer.js';

export async function layoutReportPdfDocument(
  doc: jsPDF,
  content: ExtractedReportPdfContent,
  imageLoader: (src: string) => Promise<DecodedReportPdfImage>,
): Promise<void> {
  let currentY = PAGE_MARGIN_MM;
  const bottomMargin = A4_PORTRAIT_HEIGHT_MM - PAGE_MARGIN_MM;
  const anchorMap = new Map<string, { pageNumber: number; y: number }>();
  const pendingLinks: PendingInternalLink[] = [];

  function ensureSpace(neededHeight: number): void {
    if (currentY + neededHeight > bottomMargin) {
      doc.addPage('a4', 'portrait');
      currentY = PAGE_MARGIN_MM;
    }
  }

  function renderHeading(block: ReportPdfHeadingBlock): void {
    const minSpace = block.level <= 2 ? 26 : 18;
    ensureSpace(minSpace);

    if (block.eyebrow) {
      doc.setFont(REPORT_PDF_FONT_FAMILY, 'bold');
      doc.setFontSize(PDF_FONT_SIZES.small);
      doc.setTextColor(...PDF_COLORS.textMuted);
      doc.text(block.eyebrow.toUpperCase(), PAGE_MARGIN_MM, currentY, { baseline: 'top' });
      currentY += 4.5;
    }

    const fontSize = block.level === 1 ? PDF_FONT_SIZES.h1 : block.level === 2 ? PDF_FONT_SIZES.h2 : PDF_FONT_SIZES.h3;
    doc.setFont(REPORT_PDF_FONT_FAMILY, 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(...PDF_COLORS.textPrimary);
    doc.text(block.text, PAGE_MARGIN_MM, currentY, { baseline: 'top' });

    if (block.badge) {
      const headingWidth = doc.getTextWidth(block.text);
      const badgeX = PAGE_MARGIN_MM + headingWidth + 4;
      doc.setFontSize(PDF_FONT_SIZES.small);
      doc.setFillColor(...PDF_COLORS.badgeNeutral);
      const badgeW = doc.getTextWidth(block.badge.text) + 3;
      doc.roundedRect(badgeX, currentY - 0.5, badgeW, 4.5, 1, 1, 'F');
      doc.setTextColor(...PDF_COLORS.textPrimary);
      doc.text(block.badge.text, badgeX + 1.5, currentY, { baseline: 'top' });
    }

    currentY += fontSize * 0.3528 * 1.4 + 3;
  }

  function renderParagraph(block: ReportPdfParagraphBlock): void {
    ensureSpace(8);
    const isMuted = block.variant === 'muted' || block.variant === 'empty-state';
    const color = isMuted ? PDF_COLORS.textMuted : PDF_COLORS.textPrimary;
    const fontSize = block.variant === 'lede' ? 10.5 : PDF_FONT_SIZES.body;

    const res = drawTextSpans(doc, block.spans, PAGE_MARGIN_MM, currentY, USABLE_WIDTH_PORTRAIT_MM, {
      fontSize,
      color,
    });
    pendingLinks.push(...res.pendingLinks);
    currentY = res.finalY + 2.5;
  }

  function renderList(block: ReportPdfListBlock): void {
    ensureSpace(8);
    for (let i = 0; i < block.items.length; i++) {
      const item = block.items[i]!;
      ensureSpace(6);
      const bullet = block.ordered ? `${i + 1}. ` : '• ';
      doc.setFont(REPORT_PDF_FONT_FAMILY, 'normal');
      doc.setFontSize(PDF_FONT_SIZES.body);
      doc.setTextColor(...PDF_COLORS.textPrimary);
      doc.text(bullet, PAGE_MARGIN_MM + 2, currentY, { baseline: 'top' });

      const res = drawTextSpans(doc, item.spans, PAGE_MARGIN_MM + 7, currentY, USABLE_WIDTH_PORTRAIT_MM - 7);
      pendingLinks.push(...res.pendingLinks);
      currentY = res.finalY + 1.5;
    }
    currentY += 1.5;
  }

  function renderDefinitionList(block: ReportPdfDefinitionListBlock): void {
    ensureSpace(10);
    const termWidth = 35;
    for (const item of block.items) {
      ensureSpace(8);
      const termRes = drawTextSpans(doc, item.termSpans, PAGE_MARGIN_MM, currentY, termWidth, {
        fontSize: PDF_FONT_SIZES.small,
        color: PDF_COLORS.textMuted,
      });

      const descRes = drawTextSpans(
        doc,
        item.descriptionSpans,
        PAGE_MARGIN_MM + termWidth + 4,
        currentY,
        USABLE_WIDTH_PORTRAIT_MM - termWidth - 4,
        { fontSize: PDF_FONT_SIZES.body },
      );
      pendingLinks.push(...termRes.pendingLinks, ...descRes.pendingLinks);
      currentY = Math.max(termRes.finalY, descRes.finalY) + 2;
    }
    currentY += 2;
  }

  async function renderFigure(block: ReportPdfFigureBlock): Promise<void> {
    const img = await imageLoader(block.src);
    const aspect = img.width / img.height;
    let displayW = Math.min(USABLE_WIDTH_PORTRAIT_MM, 160);
    let displayH = displayW / aspect;

    if (displayH > 120) {
      displayH = 120;
      displayW = displayH * aspect;
    }

    ensureSpace(displayH + 12);
    doc.addImage(img.dataUrl, img.format, PAGE_MARGIN_MM, currentY, displayW, displayH);
    currentY += displayH + 2.5;

    if (block.captionSpans.length > 0) {
      const res = drawTextSpans(doc, block.captionSpans, PAGE_MARGIN_MM, currentY, USABLE_WIDTH_PORTRAIT_MM, {
        fontSize: PDF_FONT_SIZES.small,
        color: PDF_COLORS.textMuted,
      });
      pendingLinks.push(...res.pendingLinks);
      currentY = res.finalY + 3;
    }
  }

  for (const block of content.blocks) {
    if ('anchorId' in block && block.anchorId && !anchorMap.has(block.anchorId)) {
      anchorMap.set(block.anchorId, { pageNumber: doc.getNumberOfPages(), y: currentY });
    }

    switch (block.type) {
      case 'heading':
        renderHeading(block);
        break;
      case 'paragraph':
        renderParagraph(block);
        break;
      case 'list':
        renderList(block);
        break;
      case 'definition-list':
        renderDefinitionList(block);
        break;
      case 'table':
        ensureSpace(28);
        currentY = renderReportPdfTable(doc, block, currentY).finalY + 4;
        break;
      case 'figure':
        await renderFigure(block);
        break;
      case 'footer':
        ensureSpace(12);
        doc.setDrawColor(...PDF_COLORS.borderGray);
        doc.setLineWidth(0.2);
        doc.line(PAGE_MARGIN_MM, currentY, PAGE_MARGIN_MM + USABLE_WIDTH_PORTRAIT_MM, currentY);
        currentY += 3;
        currentY = drawTextSpans(doc, block.spans, PAGE_MARGIN_MM, currentY, USABLE_WIDTH_PORTRAIT_MM, {
          fontSize: PDF_FONT_SIZES.footer,
          color: PDF_COLORS.textMuted,
        }).finalY + 2;
        break;
    }
  }

  for (const link of pendingLinks) {
    const target = anchorMap.get(link.anchorId);
    if (target) {
      doc.setPage(link.pageNumber);
      doc.link(link.x, link.y, link.width, link.height, { pageNumber: target.pageNumber });
    }
  }
}
