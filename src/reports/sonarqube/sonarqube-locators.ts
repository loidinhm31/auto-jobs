import { expect, type Locator, type Page } from '@playwright/test';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';
import { exactQueryValue, hasCredentialFreeAuthority } from './sonarqube-url-identity.js';
export { facetCandidates, facetCandidatesWithStatus, facetLocators } from './sonarqube-facet-locators.js';
export type { SonarFacetExtraction, SonarFacetLocators } from './sonarqube-facet-locators.js';
export {
  projectIdentityCandidates,
  projectIdentityHrefCandidates,
} from './sonarqube-project-identity-locators.js';
export interface SonarLocator {
  locator: Locator;
  strategy: string;
  validate?: (locator: Locator) => Promise<boolean>;
}
const MAX_VISIBLE_LOCATOR_MATCHES = 256;
const MAX_LOCATOR_WAIT_MS = 5_000;
type SonarLocatorFactory = () => readonly SonarLocator[] | Promise<readonly SonarLocator[]>;
type SonarLocatorCandidates = readonly SonarLocator[] | SonarLocatorFactory;
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
async function resolveCandidates(input: SonarLocatorCandidates): Promise<readonly SonarLocator[]> {
  return typeof input === 'function' ? input() : input;
}
async function isActionable(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) return false;
  if (!(await locator.isEnabled().catch(() => false))) return false;
  return (await locator.getAttribute('aria-disabled').catch(() => null)) !== 'true';
}
async function findAvailable(candidates: SonarLocatorCandidates): Promise<SonarLocator | undefined> {
  for (const candidate of await resolveCandidates(candidates)) {
    const count = await candidate.locator.count();
    for (let index = 0; index < Math.min(count, MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
      const match = candidate.locator.nth(index);
      if (!(await isActionable(match))) continue;
      if (candidate.validate !== undefined && !(await candidate.validate(match).catch(() => false))) continue;
      return { ...candidate, locator: match };
    }
  }
  return undefined;
}
export async function firstAvailable(
  candidates: SonarLocatorCandidates,
  deadline?: WorkflowDeadline,
): Promise<SonarLocator> {
  let result: SonarLocator | undefined;
  const resolve = async (): Promise<boolean> => {
    result = await findAvailable(candidates);
    return result !== undefined;
  };
  if (deadline === undefined) {
    if (!(await resolve())) throw new Error('SonarQube semantic control was not found');
  } else {
    await expect.poll(resolve, {
      timeout: deadline.requireRemaining(),
      intervals: [50, 100, 250, 500],
    }).toBe(true);
  }
  if (result === undefined) throw new Error('SonarQube semantic control was not found');
  return result;
}
function projectContentRoot(page: Page): Locator {
  return page.locator('[data-component="project-content-header"]').locator('xpath=ancestor::*[.//main][1]');
}
async function hasVisibleProjectIdentity(scope: Locator, names: readonly string[]): Promise<boolean> {
  for (const name of names) {
    const identity = new RegExp(`^${escapeRegex(name)}$`, 'u');
    const candidates = [
      scope.getByRole('link', { name, exact: true }),
      scope.getByRole('heading', { name: identity }),
      scope.getByText(name, { exact: true }),
    ];
    for (const candidate of candidates) {
      const count = await candidate.count();
      for (let index = 0; index < Math.min(count, MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
        if (await candidate.nth(index).isVisible().catch(() => false)) return true;
      }
    }
  }
  return false;
}
async function hasExpectedProjectHref(
  page: Page,
  locator: Locator,
  projectKey: string,
  pathPattern: RegExp,
): Promise<boolean> {
  const href = await locator.getAttribute('href');
  if (href === null) return false;
  try {
    const current = new URL(page.url());
    const target = new URL(href, current);
    return hasCredentialFreeAuthority(target) && target.origin === current.origin && pathPattern.test(target.pathname) && exactQueryValue(target, 'id') === projectKey;
  } catch {
    return false;
  }
}
async function isProjectAction(
  page: Page,
  scope: Locator,
  locator: Locator,
  projectKey: string,
  displayName?: string,
): Promise<boolean> {
  if (!(await hasVisibleProjectIdentity(scope, [projectKey, ...(displayName === undefined ? [] : [displayName])]))) return false;
  const href = await locator.getAttribute('href');
  return href === null || await hasExpectedProjectHref(page, locator, projectKey, /\/dashboard(?:\/|$)/iu);
}

function scopedActionCandidates(
  scopes: readonly Locator[],
  label: string,
  scopeNames: readonly string[],
  validate?: (locator: Locator) => Promise<boolean>,
): SonarLocator[] {
  return scopes.flatMap((scope, index) => [
    { locator: scope.getByRole('link', { name: label, exact: true }), strategy: `scope:${scopeNames[index]};role:link:${label}`, ...(validate === undefined ? {} : { validate }) },
    { locator: scope.getByRole('button', { name: label, exact: true }), strategy: `scope:${scopeNames[index]};role:button:${label}`, ...(validate === undefined ? {} : { validate }) },
    { locator: scope.getByRole('tab', { name: label, exact: true }), strategy: `scope:${scopeNames[index]};role:tab:${label}`, ...(validate === undefined ? {} : { validate }) },
  ]);
}

export function overviewCandidates(page: Page, projectKey: string, displayName?: string): SonarLocator[] {
  const root = projectContentRoot(page);
  return [
    {
      locator: page.getByRole('navigation', { name: 'Project', exact: true }).getByRole('link', { name: 'Overview', exact: true }),
      strategy: 'scope:project-navigation;role:link:Overview',
      validate: (locator) => hasExpectedProjectHref(page, locator, projectKey, /\/dashboard(?:\/|$)/iu),
    },
    ...scopedActionCandidates(
      [root],
      'Overview',
      ['project-content'],
      (locator) => isProjectAction(page, root, locator, projectKey, displayName),
    ).filter((candidate) => !candidate.strategy.includes(';role:link:')),
  ];
}

export function overallControlCandidates(page: Page, projectKey: string, displayName?: string): SonarLocator[] {
  const root = projectContentRoot(page);
  return scopedActionCandidates(
    [root],
    'Overall Code',
    ['project-content'],
    (locator) => isProjectAction(page, root, locator, projectKey, displayName),
  );
}

export async function overallPanel(page: Page, deadline?: WorkflowDeadline): Promise<Locator> {
  const root = projectContentRoot(page);
  const candidates = [
    root.locator('[data-component="overall-code-measures-panel"]'),
    root.locator('#tabpanel-overall'),
  ];
  let result: Locator | undefined;
  const resolve = async (): Promise<boolean> => {
    for (const candidate of candidates) {
      const count = await candidate.count();
      for (let index = 0; index < Math.min(count, MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
        const match = candidate.nth(index);
        if (await match.isVisible().catch(() => false)) {
          result = match;
          return true;
        }
      }
    }
    result = undefined;
    return false;
  };
  if (deadline === undefined) {
    if (!(await resolve())) throw new Error('SonarQube Overall panel was not visible');
  } else {
    await expect.poll(resolve, {
      timeout: Math.min(deadline.requireRemaining(), MAX_LOCATOR_WAIT_MS),
      intervals: [50, 100, 250, 500],
    }).toBe(true);
  }
  if (result === undefined) throw new Error('SonarQube Overall panel was not visible');
  return result;
}

export async function issuesControlCandidates(page: Page, projectKey: string): Promise<SonarLocator[]> {
  const candidates: SonarLocator[] = [];
  const projectNavigation = page.getByRole('navigation', { name: 'Project', exact: true });
  const projectLinks = projectNavigation.getByRole('link', { name: 'Issues', exact: true });
  for (let index = 0; index < Math.min(await projectLinks.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const projectLink = projectLinks.nth(index);
    if (await hasExpectedProjectHref(page, projectLink, projectKey, /\/issues(?:\/|$)/iu)) {
      candidates.push({
        locator: projectLink,
        strategy: 'scope:project-navigation;role:link:Issues',
        validate: (locator) => hasExpectedProjectHref(page, locator, projectKey, /\/issues(?:\/|$)/iu),
      });
    }
  }
  return candidates;
}
