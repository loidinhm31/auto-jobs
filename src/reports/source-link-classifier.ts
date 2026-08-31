import type { NormalizedProjectConfig } from '../config/config-types.js';
import { isJenkinsArtifactPathForBuild } from '../jenkins/url-identity.js';
import type { BuildReference } from '../types.js';
import { assertAllowedUrl } from '../security/url-policy.js';
import { deriveJenkinsBaseUrl } from '../config-values.js';

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
    const pathname = decodeURIComponent(new URL(href).pathname);
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

function matchesSelectedBuild(
  href: string,
  project: NormalizedProjectConfig,
  expectedBuild: BuildReference | undefined,
): boolean {
  if (expectedBuild === undefined) return true;
  const candidateUrl = new URL(href);
  const jenkinsOrigin = new URL(project.sourceOrigins.jenkins).origin;
  return candidateUrl.origin !== jenkinsOrigin || !candidateUrl.pathname.includes('/artifact/') ||
    isJenkinsArtifactPathForBuild(project.jobUrl, href, expectedBuild.number);
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
  if (unique.length > 1) warnings.push(`ambiguous ${label} candidates were rejected`);
  return undefined;
}

/** Classify only publisher-shaped links from the exact terminal Jenkins page. */
export function classifySnykLinks(
  candidates: readonly PageLinkCandidate[],
  project: NormalizedProjectConfig,
  expectedBuild?: BuildReference,
): SnykLinkClassification {
  const warnings: string[] = [];
  const reports: ClassifiedSourceLink[] = [];
  const summaries: ClassifiedSourceLink[] = [];

  for (const candidate of candidates) {
    const classified = classifySnykCandidate(candidate);
    if (classified === undefined) continue;
    if (!matchesSelectedBuild(classified.href, project, expectedBuild)) {
      warnings.push('an observed Snyk link did not belong to the selected Jenkins build');
      continue;
    }
    let validated: string;
    try {
      validated = assertAllowedUrl(
        candidate.href,
        deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl),
        project.sourceOrigins.snyk,
        'observed Snyk link',
      );
    } catch {
      warnings.push('an observed Snyk link was outside the configured origins');
      continue;
    }
    const safeCandidate = { ...classified, href: canonicalArtifactUrl(validated) };
    if (safeCandidate.kind === 'summary') summaries.push(safeCandidate);
    else if (safeCandidate.kind === 'report') reports.push(safeCandidate);
  }

  return {
    ...(() => {
      const report = chooseSingle(reports, 'Snyk report', warnings);
      return report === undefined ? {} : { report };
    })(),
    ...(() => {
      const summary = chooseSingle(summaries, 'Snyk summary', warnings);
      return summary === undefined ? {} : { summary };
    })(),
    warnings,
  };
}

export type { SonarLinkClassification } from './sonarqube/sonarqube-source-link-classifier.js';
export { classifySonarLinks } from './sonarqube/sonarqube-source-link-classifier.js';
