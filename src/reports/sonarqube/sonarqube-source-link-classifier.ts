import type { NormalizedProjectConfig } from '../../config/config-types.js';
import { assertAllowedUrl } from '../../security/url-policy.js';
import { deriveJenkinsBaseUrl } from '../../config-values.js';
import type {
  ClassifiedSourceLink,
  PageLinkCandidate,
} from '../source-link-classifier.js';
import { pushDiagnostic } from '../../workflow/diagnostics.js';
import { exactQueryValue, hasCredentialFreeAuthority, isArchivedSonarqubeSnapshot } from './sonarqube-url-identity.js';

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
  return projectId === undefined || projectId.length === 0 ? undefined : projectId;
}

function sonarHome(candidate: PageLinkCandidate, project: NormalizedProjectConfig): ClassifiedSourceLink | undefined {
  let url: URL;
  try { url = new URL(candidate.href); } catch { return undefined; }
  const path = url.pathname.toLowerCase().replace(/\/+$/u, '');
  const text = candidateText(candidate);
  const hasProjectIdParameter = url.searchParams.has('id');
  const projectId = exactQueryValue(url, 'id');
  const expectedProjectId = configuredProjectId(project);
  const archivedSnapshot = isArchivedSonarqubeSnapshot(url);
  if (hasProjectIdParameter && projectId === undefined) return undefined;
  const snapshotProjectId = projectId ?? (archivedSnapshot ? expectedProjectId : undefined);
  const configuredOrigin = project.sourceOrigins.sonarqube.some((origin) => {
    try { return new URL(origin).origin === url.origin; } catch { return false; }
  });
  if (!hasCredentialFreeAuthority(url) || (!path.endsWith('/dashboard') && !archivedSnapshot) || snapshotProjectId === undefined ||
    (expectedProjectId !== undefined && snapshotProjectId !== expectedProjectId) ||
    (!configuredOrigin && !text.includes('sonar') && !path.includes('sonar') && !url.hostname.toLowerCase().includes('sonar'))) return undefined;
  if (projectId === undefined) url.searchParams.set('id', snapshotProjectId);
  return {
    href: url.toString(), publisher: 'sonarqube', kind: 'home',
    signal: text.includes('sonar') ? 'accessible-name' : 'path',
    ...(candidate.inSidePanel ? { inSidePanel: true } : {}),
  };
}

export function classifySonarLinks(
  candidates: readonly PageLinkCandidate[],
  project: NormalizedProjectConfig,
): SonarLinkClassification {
  const warnings: string[] = [];
  const homes: ClassifiedSourceLink[] = [];
  for (const candidate of candidates) {
    const classified = sonarHome(candidate, project);
    if (classified === undefined) continue;
    try {
      const href = assertAllowedUrl(
        classified.href,
        deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl),
        project.sourceOrigins.sonarqube,
        'observed SonarQube home',
      );
      homes.push({ ...classified, href });
    } catch {
      pushDiagnostic(warnings, 'an observed SonarQube home link was outside the configured origins');
    }
  }
  const unique = [...new Map(homes.map((home) => [home.href, home])).values()];
  if (unique.length > 1) {
    const sidePanelHomes = unique.filter((home) => home.inSidePanel === true);
    if (sidePanelHomes.length === 1 && sidePanelHomes[0] !== undefined) {
      return { home: sidePanelHomes[0], warnings };
    }
    pushDiagnostic(warnings, 'ambiguous SonarQube home candidates were rejected');
  }
  const single = unique.length === 1 ? unique[0] : undefined;
  return { ...(single === undefined ? {} : { home: single }), warnings };
}
