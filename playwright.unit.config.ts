import { defineConfig } from '@playwright/test';

import { parseBrowserName } from './src/config.js';

const browserName = parseBrowserName(process.env['PLAYWRIGHT_BROWSER']);
const executablePath = process.env['PLAYWRIGHT_EXECUTABLE_PATH']?.trim();

export default defineConfig({
  testDir: './tests',
  testMatch: '**/unit/**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env['CI'] ? 'blob' : 'html',
  outputDir: 'test-results/unit',
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    headless: true,
    ...(executablePath === undefined || executablePath.length === 0
      ? {}
      : { launchOptions: { executablePath } }),
  },
  projects: [
    {
      name: `${browserName}-unit`,
      use: { browserName },
    },
  ],
});
