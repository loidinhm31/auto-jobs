import type {
  ExtractedReportPdfContent,
  ReportPdfBlock,
  ReportPdfParagraphBlock,
} from '../types/report-pdf-types.js';
import {
  extractSpansFromElement,
  parseStateBadge,
} from './report-pdf-span-extractor.js';
import {
  extractTableBlock,
  extractListBlock,
  extractDefinitionListBlock,
  extractFigureBlock,
} from './report-pdf-block-extractors.js';

export function extractReportPdfContent(container: HTMLElement): ExtractedReportPdfContent {
  const blocks: ReportPdfBlock[] = [];
  const anchorIds: string[] = [];

  const titleEl = container.querySelector('h1');
  const title = titleEl?.textContent?.trim() || 'Project Vulnerability Report';

  function walkElement(el: Element, inheritedAnchorId?: string): void {
    if (
      el.classList.contains('skip-link') ||
      el.classList.contains('control-report-bar') ||
      el.getAttribute('aria-hidden') === 'true'
    ) {
      return;
    }

    const currentAnchorId = el.getAttribute('id') || inheritedAnchorId;
    if (currentAnchorId && !anchorIds.includes(currentAnchorId)) {
      anchorIds.push(currentAnchorId);
    }

    const tagName = el.tagName.toLowerCase();

    if (tagName === 'figure' && el.classList.contains('evidence-figure')) {
      const figure = extractFigureBlock(el, currentAnchorId);
      if (figure) blocks.push(figure);
      return;
    }

    if (tagName === 'table') {
      blocks.push(extractTableBlock(el as HTMLTableElement, currentAnchorId));
      return;
    }

    if (tagName === 'ul' || tagName === 'ol') {
      blocks.push(extractListBlock(el, currentAnchorId));
      return;
    }

    if (tagName === 'dl') {
      blocks.push(extractDefinitionListBlock(el, currentAnchorId));
      return;
    }

    if (el.classList.contains('section-heading')) {
      const hEl = el.querySelector('h1, h2, h3, h4, h5, h6');
      if (hEl) {
        const level = Number(hEl.tagName.slice(1)) || 2;
        const eyebrowEl = el.querySelector('.eyebrow');
        const eyebrow = eyebrowEl?.textContent?.trim() || undefined;
        const badge = parseStateBadge(el);
        const text = hEl.textContent?.trim() ?? '';
        blocks.push({
          type: 'heading',
          level,
          text,
          anchorId: currentAnchorId,
          eyebrow,
          badge,
        });

        const extraLink = el.querySelector('a:not(.eyebrow a)');
        if (extraLink && extraLink !== hEl) {
          const spans = extractSpansFromElement(extraLink);
          if (spans.length > 0) {
            blocks.push({
              type: 'paragraph',
              spans,
              variant: 'quick-links',
            });
          }
        }
        return;
      }
    }

    if (/^h[1-6]$/.test(tagName)) {
      const level = Number(tagName.slice(1)) || 2;
      const text = el.textContent?.trim() ?? '';
      blocks.push({
        type: 'heading',
        level,
        text,
        anchorId: currentAnchorId,
      });
      return;
    }

    if (tagName === 'p') {
      const spans = extractSpansFromElement(el);
      let variant: ReportPdfParagraphBlock['variant'] = 'normal';
      if (el.classList.contains('eyebrow')) variant = 'eyebrow';
      else if (el.classList.contains('lede')) variant = 'lede';
      else if (el.classList.contains('state-message')) variant = 'state-message';
      else if (el.classList.contains('security-note')) variant = 'security-note';
      else if (el.classList.contains('empty-state')) variant = 'empty-state';
      else if (el.classList.contains('muted')) variant = 'muted';
      else if (el.classList.contains('quick-links')) variant = 'quick-links';

      blocks.push({
        type: 'paragraph',
        spans,
        anchorId: currentAnchorId,
        variant,
      });
      return;
    }

    if (tagName === 'footer') {
      blocks.push({
        type: 'footer',
        spans: extractSpansFromElement(el),
      });
      return;
    }

    let passedAnchor = currentAnchorId;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (child) {
        walkElement(child, passedAnchor);
        passedAnchor = undefined;
      }
    }
  }

  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i];
    if (child) walkElement(child);
  }

  return { title, blocks, anchorIds };
}
