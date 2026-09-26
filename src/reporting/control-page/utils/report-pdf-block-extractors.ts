import type {
  ReportPdfDefinitionItem,
  ReportPdfDefinitionListBlock,
  ReportPdfFigureBlock,
  ReportPdfListBlock,
  ReportPdfListItem,
  ReportPdfTableBlock,
  ReportPdfTableCell,
} from '../types/report-pdf-types.js';
import { extractSpansFromElement } from './report-pdf-span-extractor.js';

export function extractTableBlock(tableEl: HTMLTableElement, anchorId?: string): ReportPdfTableBlock {
  const captionEl = tableEl.querySelector('caption');
  const caption = captionEl?.textContent?.trim() || undefined;

  const headers: string[] = [];
  const theadThs = tableEl.querySelectorAll('thead th');
  theadThs.forEach((th) => headers.push(th.textContent?.trim() ?? ''));

  const rows: ReportPdfTableCell[][] = [];
  const tbodyTrs = tableEl.querySelectorAll('tbody tr');
  const trElements = tbodyTrs.length > 0 ? tbodyTrs : tableEl.querySelectorAll('tr');

  trElements.forEach((tr) => {
    if (tr.parentElement?.tagName.toLowerCase() === 'thead') return;

    const rowCells: ReportPdfTableCell[] = [];
    const cellElements = tr.querySelectorAll('th, td');
    cellElements.forEach((cell) => {
      const isHeader = cell.tagName.toLowerCase() === 'th';
      const colSpan = Number(cell.getAttribute('colspan') || '1') || 1;
      const spans = extractSpansFromElement(cell);
      const text = cell.textContent?.trim() ?? '';
      rowCells.push({
        text,
        spans,
        isHeader,
        colSpan: colSpan > 1 ? colSpan : undefined,
      });
    });
    if (rowCells.length > 0) {
      rows.push(rowCells);
    }
  });

  const variant = tableEl.classList.contains('findings-table')
    ? 'findings'
    : tableEl.classList.contains('compact-table')
      ? 'compact'
      : 'standard';

  return {
    type: 'table',
    caption,
    headers,
    rows,
    anchorId,
    variant,
  };
}

export function extractListBlock(listEl: Element, anchorId?: string): ReportPdfListBlock {
  const ordered = listEl.tagName.toLowerCase() === 'ol';
  const items: ReportPdfListItem[] = [];
  const liElements = listEl.querySelectorAll(':scope > li');

  liElements.forEach((li) => {
    const spans = extractSpansFromElement(li);
    items.push({ spans });
  });

  const variant = listEl.classList.contains('warning-list')
    ? 'warning'
    : listEl.classList.contains('provenance-list')
      ? 'provenance'
      : listEl.classList.contains('artifact-list')
        ? 'artifact'
        : 'normal';

  return {
    type: 'list',
    ordered,
    items,
    anchorId,
    variant,
  };
}

export function extractDefinitionListBlock(
  dlEl: Element,
  anchorId?: string,
): ReportPdfDefinitionListBlock {
  const items: ReportPdfDefinitionItem[] = [];

  // Check for wrapped <div><dt>...</dt><dd>...</dd></div>
  const wrapperDivs = dlEl.querySelectorAll(':scope > div');
  if (wrapperDivs.length > 0) {
    wrapperDivs.forEach((div) => {
      const dt = div.querySelector('dt');
      const dd = div.querySelector('dd');
      if (dt && dd) {
        items.push({
          termSpans: extractSpansFromElement(dt),
          descriptionSpans: extractSpansFromElement(dd),
        });
      }
    });
  } else {
    // Direct children
    const dts = dlEl.querySelectorAll('dt');
    const dds = dlEl.querySelectorAll('dd');
    for (let i = 0; i < dts.length; i++) {
      const dt = dts[i];
      const dd = dds[i];
      if (dt && dd) {
        items.push({
          termSpans: extractSpansFromElement(dt),
          descriptionSpans: extractSpansFromElement(dd),
        });
      }
    }
  }

  return {
    type: 'definition-list',
    items,
    anchorId,
  };
}

export function extractFigureBlock(figureEl: Element, anchorId?: string): ReportPdfFigureBlock | undefined {
  const imgEl = figureEl.querySelector('img');
  if (!imgEl) return undefined;
  const src = imgEl.getAttribute('src') ?? '';
  const alt = imgEl.getAttribute('alt') ?? '';

  const captionEl = figureEl.querySelector('figcaption');
  const captionSpans = captionEl ? extractSpansFromElement(captionEl) : [];

  return {
    type: 'figure',
    src,
    alt,
    captionSpans,
    anchorId,
  };
}
