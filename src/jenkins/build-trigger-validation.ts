import type { Locator, Page } from '@playwright/test';

import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import { locatorFor, readFirstHref } from './locators.js';
import type { JenkinsRunnerConfig } from './runner-config.js';
import { validateJenkinsJobActionUrl } from './url-identity.js';

export const REQUIRED_BUILD_BUTTON_CLASSES = Object.freeze([
  'jenkins-button',
  'jenkins-button--primary',
  'jenkins-!-build-color',
]);

export async function locateAndValidateBuildParametersLink(
  page: Page,
  config: JenkinsRunnerConfig,
): Promise<Locator> {
  const sidePanel = page.locator('#side-panel');
  if ((await sidePanel.count()) !== 1 || !(await sidePanel.isVisible())) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Locate side-panel', new Error('expected exactly one visible #side-panel'), config, page),
    );
  }

  const buildLink = locatorFor(sidePanel, config.selectors.buildParametersLink);
  if ((await buildLink.count()) !== 1 || !(await buildLink.isVisible())) {
    throw new JenkinsFlowError(
      formatJenkinsFailure(
        'Locate build parameters link',
        new Error('expected exactly one visible Build with Parameters link in #side-panel'),
        config,
        page,
      ),
    );
  }

  const href = await readFirstHref(buildLink, page);
  if (href === undefined) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Validate build parameters link', new Error('missing href on build link'), config, page),
    );
  }

  try {
    validateJenkinsJobActionUrl(href, config.jobUrl, config.baseUrl, { allowDelay: true, actionName: 'build' });
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure('Validate build parameters link', error, config, page));
  }

  return buildLink;
}

export async function locateAndValidateBuildFormAndButton(
  page: Page,
  config: JenkinsRunnerConfig,
): Promise<Locator> {
  const bottomSticker = page.locator('#bottom-sticker');
  if ((await bottomSticker.count()) !== 1 || !(await bottomSticker.isVisible())) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Locate bottom-sticker', new Error('expected exactly one visible #bottom-sticker'), config, page),
    );
  }

  const buildButton = locatorFor(bottomSticker, config.selectors.buildSubmitButton);
  if ((await buildButton.count()) !== 1 || !(await buildButton.isVisible())) {
    throw new JenkinsFlowError(
      formatJenkinsFailure(
        'Locate build submit button',
        new Error('expected exactly one visible Build submit button in #bottom-sticker'),
        config,
        page,
      ),
    );
  }

  const classAttr = (await buildButton.getAttribute('class')) ?? '';
  const tokenSet = new Set(classAttr.split(/\s+/u).filter(Boolean));
  const missingClasses = REQUIRED_BUILD_BUTTON_CLASSES.filter((cls) => !tokenSet.has(cls));
  if (missingClasses.length > 0) {
    throw new JenkinsFlowError(
      formatJenkinsFailure(
        'Validate build submit button classes',
        new Error(`missing required class tokens: ${missingClasses.join(', ')}`),
        config,
        page,
      ),
    );
  }

  const ancestorForms = buildButton.locator('xpath=ancestor::form');
  if ((await ancestorForms.count()) !== 1) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Validate build submit form', new Error('expected exactly one ancestor form'), config, page),
    );
  }
  const form = ancestorForms.first();
  const method = (await form.getAttribute('method'))?.toUpperCase();
  if (method !== 'POST') {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Validate build submit form', new Error(`expected form method POST, got '${method}'`), config, page),
    );
  }
  const rawAction = await form.getAttribute('action');
  if (!rawAction) {
    throw new JenkinsFlowError(
      formatJenkinsFailure('Validate build submit form', new Error('form action attribute is missing'), config, page),
    );
  }
  const resolvedAction = new URL(rawAction, page.url()).toString();
  try {
    validateJenkinsJobActionUrl(resolvedAction, config.jobUrl, config.baseUrl, { allowDelay: false, actionName: 'build' });
  } catch (error) {
    throw new JenkinsFlowError(formatJenkinsFailure('Validate build submit form action', error, config, page));
  }

  return buildButton;
}
