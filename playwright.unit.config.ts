import { defineConfig } from '@playwright/test';

import { parseBrowserName } from './src/config.js';

const environment = process.env;
const browserName = parseBrowserName(environment['PLAYWRIGHT_BROWSER']);
const executablePath = environment['PLAYWRIGHT_EXECUTABLE_PATH']?.trim();
const headlessRaw = environment['PLAYWRIGHT_HEADLESS']?.trim().toLowerCase();
const headedRaw = (environment['PLAYWRIGHT_HEADED'] ?? environment['HEADED'])?.trim().toLowerCase();
const headless = (headlessRaw === '0' || headlessRaw === 'false' || headlessRaw === 'no' || headedRaw === '1' || headedRaw === 'true' || headedRaw === 'yes')
  ? false
  : true;
const slowMoRaw = (environment['PLAYWRIGHT_SLOW_MO'] ?? environment['PLAYWRIGHT_ACTION_DELAY'])?.trim();
const slowMo = slowMoRaw !== undefined && slowMoRaw !== '' && Number.isFinite(Number(slowMoRaw)) && Number(slowMoRaw) >= 0
  ? Number(slowMoRaw)
  : undefined;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/unit/**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(environment['CI']),
  retries: environment['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: environment['CI'] ? 'blob' : 'html',
  outputDir: 'test-results/unit',
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    headless,
    launchOptions: {
      ...(executablePath === undefined || executablePath.length === 0
        ? {}
        : { executablePath }),
      ...(slowMo === undefined ? {} : { slowMo }),
    },
  },
  projects: [
    {
      name: `${browserName}-unit`,
      use: { browserName },
    },
  ],
});
