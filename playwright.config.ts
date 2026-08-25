import * as fs from 'node:fs';
import * as path from 'node:path';

import { defineConfig } from '@playwright/test';

import { parseBrowserName, parseConfig } from './src/config.js';

const environment = process.env;
const browserName = parseBrowserName(environment['PLAYWRIGHT_BROWSER']);
const reportOnly = environment['PLAYWRIGHT_REPORT_ONLY'] === '1';

function hasE2eSpecs(directory: string): boolean {
  if (!fs.existsSync(directory)) {
    return false;
  }
  return fs.readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? hasE2eSpecs(entryPath)
      : entry.name.endsWith('.spec.ts');
  });
}

const e2eDirectory = path.resolve('tests/e2e');
const hasE2eSpecFiles = hasE2eSpecs(e2eDirectory);
const runnerConfig = hasE2eSpecFiles && !reportOnly ? parseConfig(environment) : undefined;

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
    baseURL: runnerConfig?.baseUrl,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'off',
    video: 'off',
    headless: true,
  },
  projects: [
    {
      name: browserName,
      use: { browserName },
    },
  ],
});
