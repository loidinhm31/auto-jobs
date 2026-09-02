import { chromium, firefox, webkit, type Browser } from '@playwright/test';

import type { BrowserName } from './types.js';

export type BrowserLauncher = (
  browserName: BrowserName,
  environment?: NodeJS.ProcessEnv,
) => Promise<Browser>;

export interface BrowserLaunchOptions {
  executablePath?: string;
  headless?: boolean;
  slowMo?: number;
}

export function launchOptions(environment: NodeJS.ProcessEnv): BrowserLaunchOptions {
  const executablePath = environment['PLAYWRIGHT_EXECUTABLE_PATH']?.trim();
  const headlessValue = environment['PLAYWRIGHT_HEADLESS']?.trim().toLowerCase();
  const headedValue = (environment['PLAYWRIGHT_HEADED'] ?? environment['HEADED'])?.trim().toLowerCase();
  const slowMoValue = (environment['PLAYWRIGHT_SLOW_MO'] ?? environment['PLAYWRIGHT_ACTION_DELAY'])?.trim();
  let headless: boolean | undefined;
  if (headlessValue !== undefined && headlessValue !== '') {
    if (['1', 'true', 'yes'].includes(headlessValue)) headless = true;
    else if (['0', 'false', 'no'].includes(headlessValue)) headless = false;
    else throw new Error('PLAYWRIGHT_HEADLESS must be true or false');
  } else if (headedValue !== undefined && headedValue !== '') {
    if (['1', 'true', 'yes'].includes(headedValue)) headless = false;
    else if (['0', 'false', 'no'].includes(headedValue)) headless = true;
  }
  let slowMo: number | undefined;
  if (slowMoValue !== undefined && slowMoValue !== '') {
    const parsed = Number(slowMoValue);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      throw new Error('PLAYWRIGHT_SLOW_MO must be a non-negative integer');
    }
    slowMo = parsed;
  }
  return {
    ...(executablePath === undefined || executablePath === '' ? {} : { executablePath }),
    ...(headless === undefined ? {} : { headless }),
    ...(slowMo === undefined ? {} : { slowMo }),
  };
}

export async function defaultLaunch(
  browserName: BrowserName,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Browser> {
  const options = launchOptions(environment);
  if (browserName === 'firefox') return firefox.launch(options);
  if (browserName === 'webkit') return webkit.launch(options);
  return chromium.launch(options);
}
