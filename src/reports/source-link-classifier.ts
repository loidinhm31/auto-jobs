import type { NormalizedProjectConfig } from '../config/config-types.js';
import { assertAllowedUrl } from '../security/url-policy.js';
import { deriveJenkinsBaseUrl } from '../config-values.js';
import { pushDiagnostic } from '../workflow/diagnostics.js';

export type SourcePublisher = 'jenkins' | 'snyk' | 'sonarqube' | 'unknown';

export interface PageLinkCandidate {
  href: string;
  text?: string;
  ariaLabel?: string;
  title?: string;
}

export interface ClassifiedSourceLink {
  href: string;
  publisher: Exclude<SourcePublisher, 'unknown'>;
  kind: 'report' | 'summary' | 'home' | 'other';
  signal: 'configured' | 'accessible-name' | 'path';
}

export interface SnykLinkClassification {
  report?: ClassifiedSourceLink;
  summary?: ClassifiedSourceLink;
  warnings: string[];
}

function linkText(candidate: PageLinkCandidate): string {
  return [candidate.text, candidate.ariaLabel, candidate.title]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .trim();
}

function pathText(href: string): string {
  try {
    return new URL(href).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function canonicalArtifactUrl(href: string): string {
  const url = new URL(href);
  url.pathname = url.pathname.replace(/\/(?:\*fingerprint\*|\*view\*)\/?$/iu, '');
  return url.toString();
}

function basename(href: string): string {
  try {
    let pathname = new URL(href).pathname;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    }
    return pathname.slice(pathname.lastIndexOf('/') + 1).toLowerCase();
  } catch {
    return '';
  }
}

export function isArchivedSnykArtifact(href: string): boolean {
  const pathname = pathText(href);
  const artifactPath = pathname.split('/artifact/')[1] ?? '';
  return /(?:^|\/)snyk(?:[-\/]|$)/u.test(artifactPath);
}

export function classifyPublisherLink(candidate: PageLinkCandidate): SourcePublisher {
  const text = linkText(candidate).toLowerCase();
  const pathname = pathText(candidate.href);
  const host = (() => {
    try { return new URL(candidate.href).hostname.toLowerCase(); } catch { return ''; }
  })();
  if (text.includes('snyk') || pathname.includes('snyk') || host.includes('snyk')) return 'snyk';
  if (text.includes('sonar') || pathname.includes('sonar') || host.includes('sonar')) return 'sonarqube';
  if (pathname.includes('/job/') || text.includes('jenkins')) return 'jenkins';
  return 'unknown';
}

function classifySnykCandidate(candidate: PageLinkCandidate): ClassifiedSourceLink | undefined {
  if (classifyPublisherLink(candidate) !== 'snyk') return undefined;
  const text = linkText(candidate).toLowerCase();
  let canonicalHref: string;
  try { canonicalHref = canonicalArtifactUrl(candidate.href); } catch { return undefined; }
  const file = basename(canonicalHref);
  const archived = isArchivedSnykArtifact(canonicalHref);
  const isSummary = file === 'snyk-sca-results-summary.json' || (archived && file === 'report.json');
  const isReport = file === 'snyk-results.html' ||
    (text.includes('snyk test report') && file.endsWith('.html')) ||
    (archived && file === 'index.html');
  if (!isSummary && !isReport) return undefined;
  const signal = text.includes('snyk') ? 'accessible-name' : 'path';
  return {
    href: canonicalHref,
    publisher: 'snyk',
    kind: isSummary ? 'summary' : 'report',
    signal,
  };
}

function chooseSingle(
  candidates: readonly ClassifiedSourceLink[],
  label: string,
  warnings: string[],
): ClassifiedSourceLink | undefined {
  const unique = [...new Map(candidates.map((candidate) => [candidate.href, candidate])).values()];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) pushDiagnostic(warnings, `ambiguous ${label} candidates were rejected`);
  return undefined;
}

function artifactContext(href: string): string | undefined {
  try {
    const url = new URL(href);
    const marker = url.pathname.toLowerCase().indexOf('/artifact/');
    if (marker < 0) return undefined;
    return `${url.origin}${url.pathname.slice(0, marker)}`;
  } catch {
    return undefined;
  }
}

function matchingArtifactContext(report: string, summary: string): boolean {
  const reportContext = artifactContext(report);
  const summaryContext = artifactContext(summary);
  if (reportContext !== undefined || summaryContext !== undefined) {
    return reportContext !== undefined && reportContext === summaryContext;
  }
  try {
    return new URL(report).origin === new URL(summary).origin;
  } catch {
    return false;
  }
}

/** Classify publisher links from one exact Jenkins job page. */
export function classifySnykLinks(
  candidates: readonly PageLinkCandidate[],
  project: NormalizedProjectConfig,
): SnykLinkClassification {
  const warnings: string[] = [];
  const reports: ClassifiedSourceLink[] = [];
  const summaries: ClassifiedSourceLink[] = [];

  for (const candidate of candidates) {
    const classified = classifySnykCandidate(candidate);
    if (classified === undefined) continue;
    let validated: string;
    try {
      validated = assertAllowedUrl(
        candidate.href,
        deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl),
        project.sourceOrigins.snyk,
        'observed Snyk link',
      );
    } catch {
      pushDiagnostic(warnings, 'an observed Snyk link was outside the configured origins');
      continue;
    }
    const safeCandidate = { ...classified, href: canonicalArtifactUrl(validated) };
    if (safeCandidate.kind === 'summary') summaries.push(safeCandidate);
    else if (safeCandidate.kind === 'report') reports.push(safeCandidate);
  }

  const report = chooseSingle(reports, 'Snyk report', warnings);
  let summary = chooseSingle(summaries, 'Snyk summary', warnings);
  if (report !== undefined && summary !== undefined && !matchingArtifactContext(report.href, summary.href)) {
    pushDiagnostic(warnings, 'Snyk report and summary links did not share one artifact context');
    summary = undefined;
  }
  return {
    ...(report === undefined ? {} : { report }),
    ...(summary === undefined ? {} : { summary }),
    warnings,
  };
}

export type { SonarLinkClassification } from './sonarqube/sonarqube-source-link-classifier.js';
export { classifySonarLinks } from './sonarqube/sonarqube-source-link-classifier.js';
