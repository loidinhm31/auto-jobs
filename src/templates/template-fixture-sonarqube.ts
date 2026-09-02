import {
  escapeHtml,
  escapedPattern,
  exactlyOneQueryValue,
  rewriteHrefAttributes,
} from './template-fixture-html.js';
import type { SonarqubeRouteMap } from './template-fixture-types.js';

export const SAVED_SONAR_ORIGIN = 'https://sonarqube.example-domain.com';

export function isDashboardPath(url: URL): boolean {
  return url.pathname === '/dashboard' || url.pathname === '/dashboard/';
}

export function isProjectIssuesPath(url: URL): boolean {
  return url.pathname === '/project/issues' || url.pathname === '/project/issues/';
}

export function projectIdFromSonarqubeUrl(url: URL): string {
  if (url.origin !== SAVED_SONAR_ORIGIN || !isDashboardPath(url)) {
    throw new Error('SonarQube template does not contain a project dashboard identity');
  }
  const projectId = exactlyOneQueryValue(url, 'id');
  if (projectId === undefined || projectId.length > 512) {
    throw new Error('SonarQube template project identity is unsafe');
  }
  return projectId;
}

export function rewriteSonarqubeLinks(
  html: string,
  routes: SonarqubeRouteMap,
  projectName: string,
): string {
  const rewritten = rewriteHrefAttributes(html, new URL(SAVED_SONAR_ORIGIN), (url) => {
    if (url.origin !== SAVED_SONAR_ORIGIN || exactlyOneQueryValue(url, 'id') !== routes.projectId) {
      return undefined;
    }
    if (isDashboardPath(url)) {
      const scopes = url.searchParams.getAll('codeScope');
      if (scopes.length === 0) return routes.homeUrl;
      if (scopes.length === 1 && scopes[0] === 'overall') return routes.overallUrl;
    }
    if (isProjectIssuesPath(url)) return routes.issuesUrl;
    return undefined;
  });
  const withOverallLink = rewritten.replace(
    /<button([^>]*\brole="tab"[^>]*)>\s*Overall Code\s*<\/button>/giu,
    `<a$1 href="${escapeHtml(routes.overallUrl)}">Overall Code</a>`,
  );
  const sourceDisplayName = routes.projectId.slice(routes.projectId.lastIndexOf(':') + 1);
  if (sourceDisplayName === projectName) return withOverallLink;
  return withOverallLink.replace(
    new RegExp(
      `(<a[^>]*\\bjs-project-link\\b[^>]*>\\s*)${escapedPattern(sourceDisplayName)}(\\s*<\\/a>)`,
      'u',
    ),
    (_whole: string, prefix: string, suffix: string) => `${prefix}${escapeHtml(projectName)}${suffix}`,
  );
}
