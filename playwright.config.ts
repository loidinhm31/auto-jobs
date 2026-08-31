import { defineConfig } from '@playwright/test';

const environment = process.env;
const executablePath = environment['PLAYWRIGHT_EXECUTABLE_PATH']?.trim();

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(environment['CI']),
  retries: environment['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: environment['CI'] ? 'blob' : 'html',
  outputDir: 'test-results',
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'off',
    video: 'off',
    headless: true,
    ...(executablePath === undefined || executablePath.length === 0
      ? {}
      : { launchOptions: { executablePath } }),
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
