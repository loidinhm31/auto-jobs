import type { Page } from '@playwright/test';

import type {
  SnykFinding,
  SnykScanMetadata,
  SnykSeverity,
  SnykSeverityCounts,
} from '../../result-types.js';

export interface SnykHtmlEvidence {
  title?: string;
  metadata: SnykScanMetadata;
  severityCounts?: SnykSeverityCounts;
  findings: SnykFinding[];
  hasDetailCards: boolean;
  selectorStrategy?: string;
  warnings?: string[];
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const MAX_DETAIL_CARDS = 2_000;

/** Extract only visible report evidence; vendor markup is never persisted. */
export async function extractSnykHtml(page: Page): Promise<SnykHtmlEvidence> {
  return page.evaluate(({ severityNames, maxDetailCards }) => {
    const clip = (value: string | undefined, maximum: number): string | undefined => {
      const normalized = value?.replace(/\s+/gu, ' ').trim();
      return normalized === undefined || normalized.length === 0
        ? undefined
        : normalized.slice(0, maximum);
    };
    const textOf = (element: Element | null): string | undefined =>
      clip(element?.textContent ?? undefined, 8_192);
    const elements = <T extends Element>(root: ParentNode, selector: string, maximum = 128): T[] => {
      const nodes = root.querySelectorAll<T>(selector);
      const result: T[] = [];
      for (let index = 0; index < Math.min(nodes.length, maximum); index += 1) {
        const node = nodes.item(index);
        if (node !== null) result.push(node);
      }
      return result;
    };
    const severityFromValue = (value: string | null | undefined): SnykSeverity | undefined => {
      const normalized = value?.replace(/\s+/gu, ' ').trim().toLowerCase();
      if (normalized === undefined || normalized.length === 0) return undefined;
      return severityNames.find((severity) => {
        const candidate = normalized.replace(/^severity-+/u, '');
        return candidate === severity || new RegExp(`(?:^|[^a-z])${severity}(?:$|[^a-z])`, 'u').test(candidate);
      });
    };
    const severityOf = (card: Element): SnykSeverity | undefined => {
      const values = [
        card.getAttribute('data-snyk-test'),
        card.getAttribute('class'),
        card.querySelector('.label__text')?.textContent,
        ...elements(card, '[class*="label"], [data-severity], [aria-label]', 16).flatMap((element) => [
          element.getAttribute('class'),
          element.getAttribute('data-severity'),
          element.getAttribute('aria-label'),
          element.textContent,
        ]),
      ];
      for (const value of values) {
        const severity = severityFromValue(value);
        if (severity !== undefined) return severity;
      }
      return undefined;
    };
    const sectionText = (card: Element, name: string): string | undefined => {
      const heading = elements(card, 'h2', 64).find((item) =>
        item.textContent?.trim().toLowerCase() === name.toLowerCase());
      if (heading === undefined) return undefined;
      const chunks: string[] = [];
      let sibling = heading.nextElementSibling;
      let steps = 0;
      while (sibling !== null && !sibling.matches('h2') && steps < 128) {
        if (sibling.matches('p')) {
          const value = textOf(sibling);
          if (value !== undefined) chunks.push(value);
        }
        sibling = sibling.nextElementSibling;
        steps += 1;
      }
      return clip(chunks.join(' '), 8_192);
    };
    const metaValue = (card: Element, label: string): string | undefined => {
      const item = elements(card, '.card__meta__item', 64).find((candidate) =>
        candidate.textContent?.toLowerCase().includes(label.toLowerCase()));
      const value = textOf(item ?? null);
      if (value === undefined) return undefined;
      return clip(value.replace(new RegExp(`^.*?${label}\\s*:\\s*`, 'iu'), ''), 2_048);
    };
    const referenceUrls = (card: Element): string[] => elements(card, 'a[href]', 64)
      .flatMap((link) => {
        try {
          const url = new URL(link.getAttribute('href') ?? '', document.baseURI);
          return url.protocol === 'http:' || url.protocol === 'https:'
            ? [url.toString()]
            : [];
        } catch { return []; }
      });
    const findingId = (card: Element): string | undefined => {
      for (const link of elements(card, 'a[href]', 64)) {
        try {
          const url = new URL(link.getAttribute('href') ?? '', document.baseURI);
          const match = /\/vuln\/([^/?#]+)/iu.exec(url.pathname);
          if (match?.[1] !== undefined) return clip(match[1], 256);
        } catch { /* Ignore malformed evidence links. */ }
      }
      return undefined;
    };
    const cardElements = elements<HTMLElement>(document, '[data-snyk-test]', maxDetailCards + 1);
    const fallbackCards = elements<HTMLElement>(document, '.card--vuln', maxDetailCards + 1);
    const rawCards = [...new Set([...cardElements, ...fallbackCards])];
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const visibleCards = rawCards.filter(visible);
    const visibleCardSeverities = visibleCards.map(severityOf);
    const cards = visibleCards.slice(0, maxDetailCards);
    const cardSeverities = visibleCardSeverities.slice(0, maxDetailCards);
    const extractionWarnings = [
      ...(visibleCards.length > maxDetailCards ? [`Snyk detail cards exceeded the ${maxDetailCards}-card limit`] : []),
      ...(visibleCardSeverities.some((severity) => severity === undefined) ? ['Snyk detail cards contained unrecognized severity labels'] : []),
    ];
    const counts = Object.fromEntries(severityNames.map((severity) => [severity, 0])) as unknown as SnykSeverityCounts;
    for (const severity of visibleCardSeverities) if (severity !== undefined) counts[severity] += 1;
    const findings = cards.flatMap((card, index): SnykFinding[] => {
      const severity = cardSeverities[index];
      if (severity === undefined) return [];
      const paths = elements(card, '.card__meta__paths li', 64)
        .map((item) => textOf(item)?.replace(/^Introduced through\s*:\s*/iu, ''))
        .filter((value): value is string => value !== undefined);
      const id = findingId(card);
      const title = textOf(card.querySelector('.card__title'));
      const module = metaValue(card, 'Vulnerable module');
      const description = sectionText(card, 'Overview');
      const remediation = sectionText(card, 'Remediation');
      const references = referenceUrls(card);
      return [{
        ...(id === undefined ? {} : { id }),
        ...(title === undefined ? {} : { title }),
        severity,
        ...(module === undefined ? {} : { module }),
        ...(description === undefined ? {} : { description }),
        ...(remediation === undefined ? {} : { remediation }),
        ...(paths.length === 0 ? {} : { paths }),
        ...(references.length === 0 ? {} : { references }),
      }];
    });
    const rowValue = (label: string): string | undefined => {
      const row = elements(document, '.meta-row', 128).filter(visible).find((item) =>
        item.querySelector('.meta-row-label')?.textContent?.trim().toLowerCase() === label);
      return textOf(row?.querySelector('.meta-row-value') ?? null);
    };
    const countText = elements(document, '.meta-count', 128).filter(visible)
      .map((item) => textOf(item) ?? '').join(' ');
    const numberAfter = (pattern: RegExp): number | undefined => {
      const match = pattern.exec(countText);
      return match?.[1] === undefined ? undefined : Number(match[1]);
    };
    const scannedPathElement = document.querySelector('.source-panel .paths');
    const scannedPath = scannedPathElement !== null && visible(scannedPathElement) ? textOf(scannedPathElement) : undefined;
    const packageManager = rowValue('package manager');
    const project = rowValue('project');
    const dependencyCount = numberAfter(/(\d+)\s+dependencies/iu);
    const dependencyPathCount = numberAfter(/(\d+)\s+vulnerable dependency paths/iu);
    const summaryCounts = Object.fromEntries(severityNames.map((severity) => [severity, 0])) as unknown as SnykSeverityCounts;
    let hasSummaryCounts = false;
    for (const item of elements(document, '[data-severity-count], [data-severity], [class*="severity-count"]', 128).filter(visible)) {
      if (item.closest('[data-snyk-test], .card--vuln') !== null) continue;
      const severity = severityFromValue([
        item.getAttribute('data-severity'), item.getAttribute('aria-label'), item.getAttribute('class'),
      ].join(' '));
      const rawCount = item.getAttribute('data-count') ?? item.textContent ?? '';
      const match = /(?:^|\D)(\d{1,9})(?:\D|$)/u.exec(rawCount);
      if (severity === undefined || match?.[1] === undefined) continue;
      summaryCounts[severity] += Number(match[1]);
      hasSummaryCounts = true;
    }
    const semanticRoot = document.querySelector<HTMLElement>('[data-testid="snyk-report"]');
    const semanticReport = semanticRoot !== null && visible(semanticRoot) ? semanticRoot : null;
    const semanticCounts = Object.fromEntries(severityNames.map((severity) => [severity, 0])) as unknown as SnykSeverityCounts;
    let hasSemanticCounts = false;
    for (const row of semanticReport === null ? [] : elements(semanticReport, 'table tbody tr', 128).filter(visible)) {
      const label = textOf(row.querySelector('th[scope="row"], th'));
      const severity = severityFromValue(label);
      const rawCount = textOf(row.querySelector('td'));
      const match = /(?:^|\D)(\d{1,9})(?:\D|$)/u.exec(rawCount ?? '');
      if (severity === undefined || match?.[1] === undefined) continue;
      semanticCounts[severity] += Number(match[1]);
      hasSemanticCounts = true;
    }
    const semanticFindings = semanticReport === null ? [] : elements(semanticReport, '[data-testid="snyk-findings"] li', maxDetailCards + 1)
      .filter(visible)
      .map((item): SnykFinding | undefined => {
        const value = textOf(item);
        const severity = severityFromValue(value);
        if (value === undefined || severity === undefined) return undefined;
        return { title: value, severity };
      })
      .filter((finding): finding is SnykFinding => finding !== undefined);
    const semanticProjectElement = semanticReport?.querySelector('[data-testid="snyk-project"]') ?? null;
    const semanticProject = semanticReport?.getAttribute('data-project-id') ??
      (semanticProjectElement !== null && visible(semanticProjectElement) ? textOf(semanticProjectElement) : undefined)
        ?.replace(/^project\s*:\s*/iu, '').trim();
    const semanticMetadata = semanticProject === undefined || semanticProject.length === 0 ? {} : { project: semanticProject };
    const effectiveFindings = findings.length > 0 ? findings : semanticFindings;
    const effectiveHasDetailCards = visibleCards.length > 0 || semanticFindings.length > 0;
    const effectiveCounts = hasSummaryCounts ? summaryCounts : hasSemanticCounts ? semanticCounts : undefined;
    const severityCounts = cards.length > 0 ? counts : effectiveCounts;
    const metadata: SnykScanMetadata = {
      ...(scannedPath === undefined ? {} : { scannedPath }),
      ...(packageManager === undefined ? {} : { packageManager }),
      ...(project === undefined ? {} : { project }),
      ...(dependencyCount === undefined ? {} : { dependencyCount }),
      ...(dependencyPathCount === undefined ? {} : { dependencyPathCount }),
      ...semanticMetadata,
    };
    const heading = textOf(document.querySelector('h1'));
    return {
      ...(heading === undefined ? {} : { title: heading }),
      metadata,
      ...(severityCounts === undefined ? {} : { severityCounts }),
      findings: effectiveFindings,
      hasDetailCards: effectiveHasDetailCards,
      ...(cards.length > 0
        ? { selectorStrategy: cards.some((card) => cardElements.includes(card)) ? 'data-snyk-test' : 'css:.card--vuln' }
        : semanticFindings.length > 0 || hasSemanticCounts ? { selectorStrategy: 'semantic:data-testid=snyk-report' } : {}),
      ...(extractionWarnings.length === 0 ? {} : { warnings: extractionWarnings }),
    };
  }, { severityNames: [...SEVERITIES], maxDetailCards: MAX_DETAIL_CARDS });
}
