import type { Locator, Page } from '@playwright/test';

import type { SonarLocator } from './sonarqube-locators.js';
import { exactQueryValue, hasCredentialFreeAuthority } from './sonarqube-url-identity.js';

const MAX_PROJECT_IDENTITY_LINKS = 256;
const MAX_VISIBLE_LOCATOR_MATCHES = 256;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function projectIdentityScopes(page: Page): readonly Locator[] {
  return [
    page.locator('[data-component="project-content-header"]'),
    page.getByRole('navigation', { name: 'Project', exact: true }),
    page.locator('header'),
  ];
}

export function projectIdentityCandidates(page: Page, projectKey: string, displayName?: string): SonarLocator[] {
  const names = [...new Set([projectKey, displayName].filter((value): value is string => value !== undefined && value.trim().length > 0))];
  return projectIdentityScopes(page).flatMap((scope, scopeIndex) => names.flatMap((name) => {
    const pattern = new RegExp(`^${escapeRegex(name)}$`, 'u');
    const suffix = name === projectKey ? 'project-key' : 'project-display-name';
    const scopeName = scopeIndex === 0 ? 'project-content-header' : scopeIndex === 1 ? 'project-navigation' : 'header';
    return [
      { locator: scope.getByRole('link', { name, exact: true }), strategy: `scope:${scopeName};role:link:${suffix}` },
      { locator: scope.getByRole('heading', { name: pattern }), strategy: `scope:${scopeName};role:heading:${suffix}` },
      { locator: scope.getByText(name, { exact: true }), strategy: `scope:${scopeName};text:${suffix}` },
    ];
  }));
}

export async function projectIdentityHrefCandidates(page: Page, projectKey: string): Promise<SonarLocator[]> {
  const pageOrigin = new URL(page.url()).origin;
  const candidates: SonarLocator[] = [];
  for (const [scopeIndex, scope] of projectIdentityScopes(page).entries()) {
    const links = scope.getByRole('link');
    for (let index = 0; index < Math.min(await links.count(), MAX_PROJECT_IDENTITY_LINKS); index += 1) {
      const candidate = links.nth(index);
      const href = await candidate.getAttribute('href');
      if (href === null) continue;
      try {
        const url = new URL(href, page.url());
        if (hasCredentialFreeAuthority(url) && url.origin === pageOrigin && /\/dashboard(?:\/|$)/iu.test(url.pathname) && exactQueryValue(url, 'id') === projectKey) {
          const scopeName = scopeIndex === 0 ? 'project-content-header' : scopeIndex === 1 ? 'project-navigation' : 'header';
          candidates.push({ locator: candidate, strategy: `scope:${scopeName};role:link:project-key-href` });
        }
      } catch {
        // Ignore malformed links and continue to the semantic fallbacks.
      }
    }
  }
  return candidates;
}
