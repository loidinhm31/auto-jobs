import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { screenshotReport } from '../../src/reports/snyk/snyk-capture-support.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

interface ScreenshotOptions {
  path: string;
  fullPage?: boolean;
  scale?: 'css' | 'device';
}

function fakePage(failures: readonly string[]): { page: Page; attempts: () => number; topReset: () => boolean } {
  let attempts = 0;
  let topReset = false;
  const page = {
    evaluate: async () => { topReset = true; },
    screenshot: async ({ path: filename, fullPage, scale }: ScreenshotOptions) => {
      expect(fullPage).toBe(false);
      expect(scale).toBe('css');
      const failure = failures[attempts];
      attempts += 1;
      if (failure !== undefined) throw new Error(failure);
      fs.writeFileSync(filename, 'screenshot');
    },
  } as unknown as Page;
  return { page, attempts: () => attempts, topReset: () => topReset };
}

test('recovers a transient Snyk screenshot protocol failure within three attempts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-screenshot-retry-'));
  const { page, attempts, topReset } = fakePage([
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
  ]);
  try {
    const result = await screenshotReport(
      page, root, new WorkflowDeadline(1_000),
    );
    expect(topReset()).toBe(true);
    expect(attempts()).toBe(3);
    expect(result.filename).toBe('snyk-test-report.png');
    expect(result.metadata.screenshotSha256).toMatch(/^[a-f0-9]{64}$/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bounds persistent Snyk screenshot protocol failures at three attempts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-screenshot-persistent-'));
  const { page, attempts } = fakePage([
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
  ]);
  try {
    await expect(screenshotReport(page, root, new WorkflowDeadline(1_000)))
      .rejects.toThrow(/Unable to capture screenshot/iu);
    expect(attempts()).toBe(3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not retry non-protocol Snyk screenshot failures', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-screenshot-nonprotocol-'));
  const { page, attempts } = fakePage(['page.screenshot: Timeout 100ms exceeded']);
  try {
    await expect(screenshotReport(page, root, new WorkflowDeadline(1_000)))
      .rejects.toThrow(/Timeout/iu);
    expect(attempts()).toBe(1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
