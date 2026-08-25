import type { NormalizedProjectConfig } from '../../config/config-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import type {
  ClassifiedSourceLink,
  PageLinkCandidate,
} from '../source-link-classifier.js';
import { exactQueryValue, hasCredentialFreeAuthority } from './sonarqube-url-identity.js';

export interface SonarLinkClassification {
  home?: ClassifiedSourceLink;
  warnings: string[];
}

function candidateText(candidate: PageLinkCandidate): string {
  return [candidate.text, candidate.ariaLabel, candidate.title]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .toLowerCase();
}

function configuredProjectId(project: NormalizedProjectConfig): string | undefined {
  const projectId = project.sources.sonarqube.projectId?.trim();
  if (projectId !== undefined && projectId.length > 0) return projectId;
  const homeUrl = project.sources.sonarqube.homeUrl;
  if (homeUrl === undefined) return undefined;
  try {
    return exactQueryValue(new URL(homeUrl), 'id');
  } catch {
    return undefined;
  }
}

function sonarHome(candidate: PageLinkCandidate, project: NormalizedProjectConfig): ClassifiedSourceLink | undefined {
  let url: URL;
  try { url = new URL(candidate.href); } catch { return undefined; }
  const path = url.pathname.toLowerCase().replace(/\/+$/u, '');
  const text = candidateText(candidate);
  const projectId = exactQueryValue(url, 'id');
  const expectedProjectId = configuredProjectId(project);
  const configuredOrigin = project.sourceOrigins.sonarqube.some((origin) => {
    try { return new URL(origin).origin === url.origin; } catch { return false; }
  });
  if (!hasCredentialFreeAuthority(url) || !path.endsWith('/dashboard') || projectId === undefined ||
    (expectedProjectId !== undefined && projectId !== expectedProjectId) ||
    (!configuredOrigin && !text.includes('sonar') && !path.includes('sonar') && !url.hostname.toLowerCase().includes('sonar'))) return undefined;
  return {
    href: url.toString(), publisher: 'sonarqube', kind: 'home',
    signal: text.includes('sonar') ? 'accessible-name' : 'path',
  };
}

function configuredHome(href: string | undefined, project: NormalizedProjectConfig): ClassifiedSourceLink | undefined {
  if (href === undefined) return undefined;
  try {
    const validated = assertAllowedUrl(href, project.baseUrl, project.sourceOrigins.sonarqube, 'configured SonarQube home');
    const url = new URL(validated);
    const projectId = exactQueryValue(url, 'id');
    const expectedProjectId = configuredProjectId(project);
    if (!hasCredentialFreeAuthority(url) || !url.pathname.toLowerCase().replace(/\/+$/u, '').endsWith('/dashboard') || projectId === undefined ||
      (expectedProjectId !== undefined && projectId !== expectedProjectId)) return undefined;
    return { href: validated, publisher: 'sonarqube', kind: 'home', signal: 'configured' };
  } catch {
    return undefined;
  }
}

export function classifySonarLinks(
  candidates: readonly PageLinkCandidate[],
  project: NormalizedProjectConfig,
): SonarLinkClassification {
  const warnings: string[] = [];
  const configured = configuredHome(project.sources.sonarqube.homeUrl, project);
  const homes: ClassifiedSourceLink[] = configured === undefined ? [] : [configured];
  for (const candidate of candidates) {
    const classified = sonarHome(candidate, project);
    if (classified === undefined) continue;
    try {
      const href = assertAllowedUrl(candidate.href, project.baseUrl, project.sourceOrigins.sonarqube, 'observed SonarQube home');
      homes.push({ ...classified, href });
    } catch {
      warnings.push('an observed SonarQube home link was outside the configured origins');
    }
  }
  const unique = [...new Map(homes.map((home) => [home.href, home])).values()];
  if (configured !== undefined) return { home: configured, warnings };
  if (unique.length > 1) warnings.push('ambiguous SonarQube home candidates were rejected');
  return { ...(unique.length === 1 ? { home: unique[0] } : {}), warnings };
}
