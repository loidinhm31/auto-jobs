import { expect, type Locator, type Page } from '@playwright/test';

import { MAX_SONAR_FACETS, type SonarFacetCandidate } from './sonarqube-issue-facets.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';

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

const MAX_VISIBLE_LOCATOR_MATCHES = 256;
const MAX_LOCATOR_WAIT_MS = 5_000;

async function firstVisibleLocator(locator: Locator): Promise<Locator | undefined> {
  const count = await locator.count();
  for (let index = 0; index < Math.min(count, MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const match = locator.nth(index);
    if (await match.isVisible().catch(() => false)) return match;
  }
  return undefined;
}

async function firstVisibleFacetHeader(
  container: Locator | Page,
  label: 'Type' | 'Severity',
): Promise<Locator | undefined> {
  const candidates = [
    container.getByRole('button', { name: label, exact: true }),
    container.getByRole('heading', { name: label, exact: true }),
    container.getByText(label, { exact: true }),
  ];
  for (const candidate of candidates) {
    const match = await firstVisibleLocator(candidate);
    if (match !== undefined) return match;
  }
  return undefined;
}

async function findFacetLocators(
  page: Page,
  property: 'types' | 'severities',
  label: 'Type' | 'Severity',
): Promise<SonarFacetLocators | undefined> {
  const semantic = page.locator(`[data-component="facet-box"][data-property="${property}"]`);
  for (let index = 0; index < Math.min(await semantic.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const container = semantic.nth(index);
    const header = await firstVisibleFacetHeader(container, label);
    const panel = container.getByRole('group').first();
    if (header !== undefined && await panel.count() > 0) {
      return {
        container,
        header,
        panel,
        strategy: `data-property:${property};semantic:${label}`,
      };
    }
  }

  const generated = page.locator(`div:has(> [role="group"]):has(button[aria-label="${label}"])`);
  for (let index = 0; index < Math.min(await generated.count(), MAX_VISIBLE_LOCATOR_MATCHES); index += 1) {
    const container = generated.nth(index);
    const header = await firstVisibleFacetHeader(container, label);
    const panel = container.getByRole('group').first();
    if (header !== undefined && await panel.count() > 0) {
      return {
        container,
        header,
        panel,
        strategy: `scoped-generated-fallback:facet-ancestor:has(${label})`,
      };
    }
  }

  const header = await firstVisibleFacetHeader(page, label);
  if (header === undefined) return undefined;
  const container = header.locator('xpath=ancestor::div[.//*[@role="group"]][1]');
  const panel = container.getByRole('group').first();
  if (await panel.count() === 0) return undefined;
  return {
    container,
    header,
    panel,
    strategy: `scoped-generated-fallback:ancestor-with-group:${label}`,
  };
}

export async function facetLocators(
  page: Page,
  property: 'types' | 'severities',
  label: 'Type' | 'Severity',
  deadline?: WorkflowDeadline,
): Promise<SonarFacetLocators> {
  let result: SonarFacetLocators | undefined;
  const resolve = async (): Promise<boolean> => {
    result = await findFacetLocators(page, property, label);
    return result !== undefined;
  };
  if (deadline === undefined) {
    if (!(await resolve())) throw new Error(`SonarQube ${label} facet was not found`);
  } else {
    await expect.poll(resolve, {
      timeout: Math.min(deadline.requireRemaining(), MAX_LOCATOR_WAIT_MS),
      intervals: [50, 100, 250, 500],
    }).toBe(true);
  }
  if (result === undefined) throw new Error(`SonarQube ${label} facet was not found`);
  return result;
}

export async function facetCandidatesWithStatus(
  facet: SonarFacetLocators,
  kind: 'types' | 'severities',
  deadline?: WorkflowDeadline,
): Promise<SonarFacetExtraction> {
  const controls = facet.panel.locator(
    'a[data-facet], button[data-facet], [role="checkbox"][data-facet]',
  );
  if (deadline !== undefined) {
    try {
      await expect.poll(() => controls.count(), {
        timeout: Math.min(deadline.requireRemaining(), MAX_LOCATOR_WAIT_MS),
        intervals: [50, 100, 250, 500],
      }).toBeGreaterThan(0);
    } catch {
      return { values: [], truncated: false };
    }
  }

  const total = await controls.count();
  const values: SonarFacetCandidate[] = [];
  for (let index = 0; index < Math.min(total, MAX_SONAR_FACETS); index += 1) {
    const control = controls.nth(index);
    const name = (await control.locator('.name').first().textContent().catch(() => null))?.trim();
    const title = (await control.getAttribute('title'))?.trim();
    const accessible = (await control.getAttribute('aria-label'))?.trim();
    const stat = (await control.locator('.stat').first().textContent().catch(() => null))?.trim();
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
  deadline?: WorkflowDeadline,
): Promise<SonarFacetCandidate[]> {
  return (await facetCandidatesWithStatus(facet, kind, deadline)).values;
}
