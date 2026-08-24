import type { Locator, Page } from '@playwright/test';

import { MAX_SONAR_FACETS, type SonarFacetCandidate } from './sonarqube-issue-facets.js';

export interface SonarLocator {
  locator: Locator;
  strategy: string;
}

export interface SonarFacetLocators {
  container: Locator;
  header: Locator;
  panel: Locator;
  strategy: string;
}

export interface SonarFacetExtraction {
  values: SonarFacetCandidate[];
  truncated: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const MAX_PROJECT_IDENTITY_LINKS = 256;
const MAX_VISIBLE_LOCATOR_MATCHES = 256;

export async function firstAvailable(candidates: readonly SonarLocator[]): Promise<SonarLocator> {
  for (const candidate of candidates) {
    const count = await candidate.locator.count();
    for (let index = 0; index < Math.min(count, MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
      const match = candidate.locator.nth(index);
      if (await match.isVisible().catch(() => false)) return { ...candidate, locator: match };
    }
  }
  throw new Error('SonarQube semantic control was not found');
}

export function projectIdentityCandidates(page: Page, projectKey: string, displayName?: string): SonarLocator[] {
  const names = [...new Set([projectKey, displayName].filter((value): value is string => value !== undefined && value.trim().length > 0))];
  return names.flatMap((name) => {
    const pattern = new RegExp(escapeRegex(name), 'u');
    const suffix = name === projectKey ? 'project-key' : 'project-display-name';
    return [
      { locator: page.getByRole('link', { name, exact: true }), strategy: `role:link:${suffix}` },
      { locator: page.getByRole('heading', { name: pattern }), strategy: `role:heading:${suffix}` },
      { locator: page.getByText(name, { exact: true }), strategy: `text:${suffix}` },
    ];
  });
}

export async function projectIdentityHrefCandidates(page: Page, projectKey: string): Promise<SonarLocator[]> {
  const links = page.getByRole('link');
  const candidates: SonarLocator[] = [];
  for (let index = 0; index < Math.min(await links.count(), MAX_PROJECT_IDENTITY_LINKS); index += 1) {
    const candidate = links.nth(index);
    const href = await candidate.getAttribute('href');
    if (href === null) continue;
    try {
      const url = new URL(href, page.url());
      if (/\/dashboard(?:\/|$)/iu.test(url.pathname) && url.searchParams.get('id') === projectKey) {
        candidates.push({ locator: candidate, strategy: 'role:link:project-key-href' });
      }
    } catch {
      // Ignore malformed links and continue to the semantic fallbacks.
    }
  }
  return candidates;
}

export function overviewCandidates(page: Page): SonarLocator[] {
  return [
    { locator: page.getByRole('link', { name: 'Overview', exact: true }), strategy: 'role:link:Overview' },
    { locator: page.getByRole('heading', { name: 'Overview', exact: true }), strategy: 'role:heading:Overview' },
    { locator: page.getByText('Overview', { exact: true }), strategy: 'text:Overview' },
  ];
}

export function overallControlCandidates(page: Page): SonarLocator[] {
  return [
    { locator: page.getByRole('tab', { name: 'Overall Code', exact: true }), strategy: 'role:tab:Overall Code' },
    { locator: page.getByRole('button', { name: 'Overall Code', exact: true }), strategy: 'role:button:Overall Code' },
    { locator: page.getByRole('link', { name: 'Overall Code', exact: true }), strategy: 'role:link:Overall Code' },
    { locator: page.getByText('Overall Code', { exact: true }), strategy: 'text:Overall Code' },
  ];
}

export async function overallPanel(page: Page): Promise<Locator> {
  const candidates = [
    page.locator('[data-component="overall-code-measures-panel"]'),
    page.locator('#tabpanel-overall'),
  ];
  for (const candidate of candidates) {
    const count = await candidate.count();
    for (let index = 0; index < Math.min(count, MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
      const match = candidate.nth(index);
      if (await match.isVisible().catch(() => false)) return match;
    }
  }
  throw new Error('SonarQube Overall panel was not visible');
}

export async function issuesControlCandidates(page: Page, projectKey: string): Promise<SonarLocator[]> {
  const candidates: SonarLocator[] = [];
  const projectNavigation = page.getByRole('navigation', { name: 'Project', exact: true });
  const projectLinks = projectNavigation.getByRole('link', { name: 'Issues', exact: true });
  for (let index = 0; index < Math.min(await projectLinks.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const projectLink = projectLinks.nth(index);
    const projectHref = await projectLink.getAttribute('href');
    if (projectHref !== null) {
      try {
        const url = new URL(projectHref, page.url());
        if (/\/issues(?:\/|$)/iu.test(url.pathname) && url.searchParams.get('id') === projectKey) {
          candidates.push({ locator: projectLink, strategy: 'role:navigation:Project>role:link:Issues' });
        }
      } catch {
        // Ignore malformed project-navigation links and continue to validated candidates.
      }
    }
  }
  const projectButtons = projectNavigation.getByRole('button', { name: 'Issues', exact: true });
  for (let index = 0; index < Math.min(await projectButtons.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    candidates.push({ locator: projectButtons.nth(index), strategy: 'role:navigation:Project>role:button:Issues' });
  }

  const links = page.getByRole('link', { name: 'Issues', exact: true });
  for (let index = 0; index < Math.min(await links.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const candidate = links.nth(index);
    const href = await candidate.getAttribute('href');
    if (href === null) continue;
    try {
      const url = new URL(href, page.url());
      if (/\/issues(?:\/|$)/iu.test(url.pathname) && url.searchParams.get('id') === projectKey) {
        candidates.push({ locator: candidate, strategy: `role:link:Issues;project-id:${projectKey}` });
      }
    } catch {
      // Ignore malformed observed links and fail closed if no scoped link remains.
    }
  }
  return candidates;
}

export async function facetLocators(
  page: Page,
  property: 'types' | 'severities',
  label: 'Type' | 'Severity',
): Promise<SonarFacetLocators> {
  const semantic = page.locator(`[data-component="facet-box"][data-property="${property}"]`);
  for (let index = 0; index < Math.min(await semantic.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const container = semantic.nth(index);
    const header = await firstVisibleLocator(container.getByRole('button', { name: label, exact: true }));
    if (header !== undefined) {
      return {
        container,
        header,
        panel: container.getByRole('group').first(),
        strategy: `data-property:${property};role:button:${label}`,
      };
    }
  }
  const generated = page.locator(`div:has(> [role="group"]):has(button[aria-label="${label}"])`);
  for (let index = 0; index < Math.min(await generated.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const container = generated.nth(index);
    const header = await firstVisibleLocator(container.getByRole('button', { name: label, exact: true }));
    if (header !== undefined) {
      return {
        container,
        header,
        panel: container.getByRole('group').first(),
        strategy: `scoped-generated-fallback:facet-ancestor:has(${label})`,
      };
    }
  }
  const header = await firstVisibleLocator(page.getByRole('button', { name: label, exact: true }));
  if (header === undefined) throw new Error(`SonarQube ${label} facet was not found`);
  const container = header.locator('xpath=ancestor::div[.//*[@role="group"]][1]');
  const panel = container.getByRole('group').first();
  if (await panel.count() === 0) throw new Error(`SonarQube ${label} facet panel was not found`);
  return {
    container,
    header,
    panel,
    strategy: `scoped-generated-fallback:ancestor-with-group:${label}`,
  };
}

async function firstVisibleLocator(locator: Locator): Promise<Locator | undefined> {
  const count = await locator.count();
  for (let index = 0; index < Math.min(count, MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const match = locator.nth(index);
    if (await match.isVisible().catch(() => false)) return match;
  }
  return undefined;
}

export async function facetCandidatesWithStatus(
  facet: SonarFacetLocators,
  kind: 'types' | 'severities',
): Promise<SonarFacetExtraction> {
  const buttons = facet.panel.getByRole('checkbox');
  const total = await buttons.count();
  const values: SonarFacetCandidate[] = [];
  for (let index = 0; index < Math.min(total, MAX_SONAR_FACETS); index += 1) {
    const button = buttons.nth(index);
    const name = (await button.locator('.name').first().textContent().catch(() => null))?.trim();
    const title = (await button.getAttribute('title'))?.trim();
    const accessible = (await button.getAttribute('aria-label'))?.trim();
    const stat = (await button.locator('.stat').first().textContent().catch(() => null))?.trim();
    const label = (kind === 'severities' ? title : name) ?? accessible?.replace(/\s+\d+$/u, '');
    const count = stat ?? accessible?.match(/(\d+)\s*$/u)?.[1];
    values.push({
      label: label?.replace(/^Severity:\s*/iu, '').trim() ?? '',
      count: count ?? '',
    });
  }
  return { values, truncated: total > MAX_SONAR_FACETS };
}

export async function facetCandidates(
  facet: SonarFacetLocators,
  kind: 'types' | 'severities',
): Promise<SonarFacetCandidate[]> {
  return (await facetCandidatesWithStatus(facet, kind)).values;
}
