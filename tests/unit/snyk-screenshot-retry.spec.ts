import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { screenshotReport } from '../../src/reports/snyk/snyk-capture-support.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

interface FakeReport {
  count: () => Promise<number>;
  filter: () => FakeReport;
  first: () => FakeReport;
  scrollIntoViewIfNeeded: () => Promise<void>;
  screenshot: (options: { path: string }) => Promise<void>;
}

function fakeReport(failures: readonly string[]): { report: FakeReport; attempts: () => number } {
  let attempts = 0;
  const report = {} as FakeReport;
  report.count = async () => 1;
  report.filter = () => report;
  report.first = () => report;
  report.scrollIntoViewIfNeeded = async () => undefined;
  report.screenshot = async ({ path: filename }) => {
    const failure = failures[attempts];
    attempts += 1;
    if (failure !== undefined) throw new Error(failure);
    fs.writeFileSync(filename, 'screenshot');
  };
  return { report, attempts: () => attempts };
}

function fakePage(report: FakeReport): Page {
  return { locator: () => report } as unknown as Page;
}

test('recovers a transient Snyk screenshot protocol failure within three attempts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-screenshot-retry-'));
  const { report, attempts } = fakeReport([
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
  ]);
  try {
    const result = await screenshotReport(
      fakePage(report), {} as Locator, root, new WorkflowDeadline(1_000),
    );
    expect(attempts()).toBe(3);
    expect(result.filename).toBe('snyk-test-report.png');
    expect(result.metadata.screenshotSha256).toMatch(/^[a-f0-9]{64}$/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bounds persistent Snyk screenshot protocol failures at three attempts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-screenshot-persistent-'));
  const { report, attempts } = fakeReport([
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
    'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
  ]);
  try {
    await expect(screenshotReport(fakePage(report), {} as Locator, root, new WorkflowDeadline(1_000)))
      .rejects.toThrow(/Unable to capture screenshot/iu);
    expect(attempts()).toBe(3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not retry non-protocol Snyk screenshot failures', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-screenshot-nonprotocol-'));
  const { report, attempts } = fakeReport(['locator.screenshot: Timeout 100ms exceeded']);
  try {
    await expect(screenshotReport(fakePage(report), {} as Locator, root, new WorkflowDeadline(1_000)))
      .rejects.toThrow(/Timeout/iu);
    expect(attempts()).toBe(1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
