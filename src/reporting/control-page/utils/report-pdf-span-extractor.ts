import { safeExternalHref, localAnchorHref } from '../../report-links.js';
import type { ReportPdfLinkSpan, ReportPdfTextSpan } from '../types/report-pdf-types.js';

export function parseStateBadge(
  element: Element,
): { text: string; variant?: string | undefined } | undefined {
  const badgeEl = element.classList.contains('state-badge')
    ? element
    : element.querySelector('.state-badge');
  if (!badgeEl) return undefined;
  const text = badgeEl.textContent?.trim() ?? '';
  if (text.length === 0) return undefined;
  const classes = Array.from(badgeEl.classList);
  const variant = classes.find((cls) => cls.startsWith('state-') && cls !== 'state-badge');
  return { text, variant };
}

export function parseSeverityBadge(
  element: Element,
): { text: string; variant?: string | undefined } | undefined {
  const badgeEl = element.classList.contains('severity')
    ? element
    : element.querySelector('.severity');
  if (!badgeEl) return undefined;
  const text = badgeEl.textContent?.trim() ?? '';
  if (text.length === 0) return undefined;
  const classes = Array.from(badgeEl.classList);
  const variant = classes.find((cls) => cls.startsWith('severity-') && cls !== 'severity');
  return { text, variant };
}

function extractSpansFromNode(
  node: Node,
  inherited: { isBold?: boolean | undefined; isCode?: boolean | undefined; link?: ReportPdfLinkSpan | undefined },
  spans: ReportPdfTextSpan[],
): void {
  if (node.nodeType === 3) {
    const text = node.nodeValue ?? '';
    if (text.length > 0) {
      spans.push({
        text,
        isBold: inherited.isBold,
        isCode: inherited.isCode,
        link: inherited.link,
      });
    }
    return;
  }

  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tagName = el.tagName.toLowerCase();

  if (tagName === 'br') {
    spans.push({ text: '\n' });
    return;
  }

  const badge = parseStateBadge(el);
  if (badge) {
    spans.push({
      text: badge.text,
      isBadge: true,
      badgeVariant: badge.variant,
      isBold: true,
    });
    return;
  }

  const severity = parseSeverityBadge(el);
  if (severity) {
    spans.push({
      text: severity.text,
      isBadge: true,
      badgeVariant: severity.variant,
      isBold: true,
    });
    return;
  }

  let nextInherited = { ...inherited };

  if (tagName === 'b' || tagName === 'strong' || tagName === 'th') {
    nextInherited = { ...nextInherited, isBold: true };
  } else if (tagName === 'code') {
    nextInherited = { ...nextInherited, isCode: true };
  } else if (tagName === 'a') {
    const rawHref = el.getAttribute('href') ?? '';
    const safeExternal = safeExternalHref(rawHref);
    const safeAnchor = localAnchorHref(rawHref);
    if (safeExternal) {
      nextInherited = {
        ...nextInherited,
        link: { text: el.textContent?.trim() ?? rawHref, href: safeExternal, isExternal: true },
      };
    } else if (safeAnchor) {
      nextInherited = {
        ...nextInherited,
        link: { text: el.textContent?.trim() ?? rawHref, href: safeAnchor, isExternal: false },
      };
    }
  }

  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child) {
      extractSpansFromNode(child, nextInherited, spans);
    }
  }
}

export function extractSpansFromElement(element: Element): readonly ReportPdfTextSpan[] {
  const spans: ReportPdfTextSpan[] = [];
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child) {
      extractSpansFromNode(child, {}, spans);
    }
  }
  return spans;
}
