import type { Locator, Page } from '@playwright/test';

import type { LocatorSelector } from '../types.js';

type AriaRole = Parameters<Page['getByRole']>[0];

/** Map the small config selector contract to user-facing Playwright locators. */
export function locatorFor(page: Page, selector: LocatorSelector): Locator {
  switch (selector.kind) {
    case 'role': {
      const role = selector.value as AriaRole;
      return selector.name === undefined
        ? page.getByRole(role)
        : page.getByRole(role, { name: selector.name });
    }
    case 'label':
      return page.getByLabel(selector.value);
    case 'testId':
      return page.getByTestId(selector.value);
    case 'text':
      return page.getByText(selector.value);
    case 'css':
      return page.locator(selector.value);
  }
}

/** Read an href from the configured element or its first nested link. */
export async function readFirstHref(
  locator: Locator,
  page: Page,
): Promise<string | undefined> {
  const candidates = [locator.first(), locator.first().locator('a').first()];
  for (const candidate of candidates) {
    if ((await candidate.count()) === 0) {
      continue;
    }
    const href = await candidate.getAttribute('href');
    if (href !== null && href.trim().length > 0) {
      return new URL(href, page.url()).toString();
    }
  }
  return undefined;
}

/** Read visible candidate links without accepting them as trusted Jenkins URLs. */
export async function readAllHrefs(locator: Locator, page: Page): Promise<string[]> {
  const hrefs = await locator.evaluateAll((elements) => elements.flatMap((element) => [
    element.getAttribute('href'),
    ...[...element.querySelectorAll('a[href]')].map((link) => link.getAttribute('href')),
  ])
    .filter((href): href is string => href !== null && href.trim().length > 0));
  return [...new Set(hrefs.map((href) => new URL(href, page.url()).toString()))];
}

export function selectorDescription(selector: LocatorSelector): string {
  const name = selector.name === undefined ? '' : ` name=${selector.name}`;
  return `${selector.kind}:${selector.value}${name}`;
}
