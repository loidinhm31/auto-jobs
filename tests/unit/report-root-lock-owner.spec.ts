import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  acquireReportRootLock,
  reclaimIncompleteLock,
  reclaimStaleLock,
  readLockOwner,
  type LockOwner,
} from '../../src/artifacts/report-root-lock-owner.js';
import {
  inspectProcessInstance,
  parseProcessInspectionOutput,
} from '../../src/artifacts/process-instance-inspector.js';

const NOW = new Date('2026-08-25T00:00:00.000Z');
const OLD = new Date(NOW.getTime() - 60 * 60 * 1_000);
const STARTED_AT = '2026-08-24T23:00:00.0000000Z';
const REUSED_AT = '2026-08-24T23:01:00.0000000Z';

function createOwner(processStartedAt?: string): LockOwner {
  return {
    schemaVersion: 1,
    token: 'a'.repeat(32),
    pid: 2552,
    hostname: os.hostname(),
    acquiredAt: OLD.toISOString(),
    expiresAt: OLD.getTime(),
    ...(processStartedAt === undefined ? {} : { processStartedAt }),
  };
}

function createLock(root: string, owner?: LockOwner): string {
  const directory = path.join(root, '.report-root-lock');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (owner !== undefined) fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify(owner));
  return directory;
}

function markOld(filename: string): void {
  fs.utimesSync(filename, OLD, OLD);
}

test('parses only the bounded process-inspection protocol', () => {
  expect(parseProcessInspectionOutput('DEAD\r\n')).toEqual({ state: 'dead' });
  expect(parseProcessInspectionOutput(`LIVE|${STARTED_AT}\n`)).toEqual({ state: 'live', startedAt: STARTED_AT });
  expect(parseProcessInspectionOutput('LIVE|not-a-time\n')).toEqual({ state: 'unknown' });
  expect(parseProcessInspectionOutput('DEAD\nLIVE|x\n')).toEqual({ state: 'unknown' });
  expect(parseProcessInspectionOutput(`${'x'.repeat(2_000)}\n`)).toEqual({ state: 'unknown' });
});

test('reclaims an expired lock when a Windows PID was reused', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-lock-reused-pid-'));
  try {
    const reportRoot = path.join(root, 'reports');
    fs.mkdirSync(reportRoot);
    const owner = createOwner(STARTED_AT);
    const directory = createLock(reportRoot, owner);
    const reclaimed = await reclaimStaleLock(
      reportRoot,
      owner,
      NOW.getTime(),
      owner.hostname,
      async () => ({ state: 'live', startedAt: REUSED_AT }),
    );
    expect(reclaimed).toBe(true);
    expect(fs.existsSync(directory)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preserves expired locks for matching, legacy, and unknown owners', async () => {
  const cases = [
    { name: 'matching identity', owner: createOwner(STARTED_AT), inspection: { state: 'live' as const, startedAt: STARTED_AT } },
    { name: 'legacy identity', owner: createOwner(), inspection: { state: 'live' as const, startedAt: REUSED_AT } },
    { name: 'unknown inspection', owner: createOwner(STARTED_AT), inspection: { state: 'unknown' as const } },
  ];
  for (const item of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-lock-preserve-'));
    try {
      const reportRoot = path.join(root, 'reports');
      fs.mkdirSync(reportRoot);
      const directory = createLock(reportRoot, item.owner);
      const reclaimed = await reclaimStaleLock(reportRoot, item.owner, NOW.getTime(), item.owner.hostname, async () => item.inspection);
      expect(reclaimed, item.name).toBe(false);
      expect(fs.existsSync(directory), item.name).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('reclaims an incomplete claim when its recorded PID was reused', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-lock-reused-claim-'));
  try {
    const reportRoot = path.join(root, 'reports');
    fs.mkdirSync(reportRoot);
    const directory = createLock(reportRoot);
    const claim = { schemaVersion: 1, pid: 2552, hostname: os.hostname(), acquiredAt: OLD.toISOString(), expiresAt: OLD.getTime(), processStartedAt: STARTED_AT };
    const claimPath = path.join(directory, '.claim.json');
    fs.writeFileSync(claimPath, JSON.stringify(claim));
    markOld(directory);
    markOld(claimPath);
    expect(await reclaimIncompleteLock(reportRoot, NOW.getTime(), 1_000, os.hostname(), async () => ({ state: 'live', startedAt: REUSED_AT }))).toBe(true);
    expect(fs.existsSync(directory)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persists a process creation identity on Windows lock owners', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-lock-identity-'));
  try {
    const reportRoot = path.join(root, 'reports');
    fs.mkdirSync(reportRoot);
    const lock = await acquireReportRootLock(reportRoot, { leaseMs: 2_000, heartbeatMs: 500, waitMs: 0 });
    const owner = await readLockOwner(path.join(reportRoot, '.report-root-lock'));
    if (process.platform === 'win32') expect(owner?.processStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    else expect(owner?.processStartedAt).toBeUndefined();
    await lock.release();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports the current and an impossible process safely', async () => {
  const current = await inspectProcessInstance(process.pid);
  if (process.platform === 'win32') {
    expect(current.state).toBe('live');
    if (current.state === 'live') expect(current.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(await inspectProcessInstance(99_999_999)).toEqual({ state: 'dead' });
  } else {
    expect(current).toEqual({ state: 'live' });
  }
});