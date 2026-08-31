import { defineConfig } from '@playwright/test';

const executablePath = process.env['PLAYWRIGHT_EXECUTABLE_PATH']?.trim();

export default defineConfig({
  testDir: './tests',
  testMatch: '**/e2e/template-navigation.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env['CI'] ? 'blob' : 'html',
  outputDir: 'test-results/templates-webkit',
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
  projects: [{ name: 'webkit-template', use: { browserName: 'webkit' } }],
});
