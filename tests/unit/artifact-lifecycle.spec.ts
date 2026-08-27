import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';

import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import { recoverAggregatePublication } from '../../src/artifacts/aggregate-publication-recovery.js';
import { stagingLeasePath } from '../../src/artifacts/staging-lease.js';

const NOW = new Date('2026-08-25T00:00:00.000Z');
const OLD = new Date(NOW.getTime() - 60 * 60 * 1_000);

function markOld(filename: string): void {
  fs.utimesSync(filename, OLD, OLD);
}

function childCode(moduleName: string, importName: string, body: string): string {
  const moduleUrl = pathToFileURL(path.resolve(`src/artifacts/${moduleName}.ts`)).href;
  return `import { ${importName} } from ${JSON.stringify(moduleUrl)};\n${body}`;
}

async function waitForOutput(child: ReturnType<typeof spawn>, marker: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(marker)) resolve();
    });
    child.stderr?.on('data', () => undefined);
    child.once('error', reject);
    child.once('exit', (code, signal) => reject(new Error(`child exited before ${marker}: ${code ?? signal}`)));
  });
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

test('reaps stale staging and publication temporaries without following symlinks', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-lifecycle-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    const paths = new ArtifactPaths(reportRoot, stagingRoot);
    await paths.initialize();
    const staleRunId = createRunId(NOW, '0000000000000101');
    const stale = await paths.allocateStaging('service-a', staleRunId);
    fs.writeFileSync(path.join(stale, 'partial.tmp'), 'partial');
    const leasePath = path.join(stagingRoot, '.leases', 'service-a', `${staleRunId}.lease`);
    const leaseTemp = path.join(stagingRoot, '.leases', 'service-a', '.service-a.lease.0000000000000007.tmp');
    fs.writeFileSync(leaseTemp, 'partial-lease');
    fs.writeFileSync(leasePath, JSON.stringify({ schemaVersion: 1, projectId: 'service-a', runId: staleRunId, pid: 99999999, createdAt: OLD.toISOString(), expiresAt: OLD.getTime() }));
    markOld(stale); markOld(path.join(stale, 'partial.tmp')); markOld(leaseTemp); markOld(leasePath);

    const activeRunId = createRunId(NOW, '0000000000000102');
    const active = await paths.allocateStaging('service-a', activeRunId);
    markOld(active);
    const buildRoot = path.join(reportRoot, 'service-a', '42');
    const publication = path.join(buildRoot, '.run-publication-stale');
    fs.mkdirSync(publication, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(publication, 'partial.tmp'), 'partial');
    markOld(publication); markOld(path.join(publication, 'partial.tmp'));
    fs.writeFileSync(path.join(reportRoot, '.tmp-stale'), 'partial'); markOld(path.join(reportRoot, '.tmp-stale'));
    const outside = path.join(root, 'outside.txt');
    fs.writeFileSync(outside, 'must survive');
    fs.symlinkSync(outside, path.join(buildRoot, '.run-publication-link'));

    const result = await paths.cleanupOrphans({ now: NOW, minimumAgeMs: 100 });
    expect(result.removed).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(leaseTemp)).toBe(false);
    expect(fs.existsSync(publication)).toBe(false);
    expect(fs.existsSync(path.join(reportRoot, '.tmp-stale'))).toBe(false);
    expect(fs.existsSync(active)).toBe(true);
    expect(fs.readFileSync(outside, 'utf8')).toBe('must survive');
    expect(fs.lstatSync(path.join(buildRoot, '.run-publication-link')).isSymbolicLink()).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('symlink'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reaps an expired lease left behind after a staging publication rename', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-orphan-lease-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    const paths = new ArtifactPaths(reportRoot, stagingRoot);
    await paths.initialize();
    const runId = createRunId(NOW, '0000000000000104');
    const staging = await paths.allocateStaging('service-a', runId);
    const leasePath = stagingLeasePath(stagingRoot, 'service-a', runId);
    const destination = path.join(reportRoot, 'service-a', 'pre-build', runId);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.renameSync(staging, destination);
    fs.writeFileSync(leasePath, JSON.stringify({
      schemaVersion: 1, projectId: 'service-a', runId, pid: 99999999,
      createdAt: OLD.toISOString(), expiresAt: OLD.getTime(),
    }));
    markOld(leasePath);

    const result = await paths.cleanupOrphans({ now: NOW, minimumAgeMs: 100 });
    expect(result.removed).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(destination)).toBe(true);
    expect(fs.existsSync(leasePath)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preserves oversized orphan candidates and recovers a terminated staging owner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-crash-recovery-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    const paths = new ArtifactPaths(reportRoot, stagingRoot);
    await paths.initialize();
    const oversized = path.join(reportRoot, 'service-a', '42', '.run-publication-oversized');
    fs.mkdirSync(oversized, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(oversized, 'large.tmp'), '0123456789');
    markOld(oversized); markOld(path.join(oversized, 'large.tmp'));
    const bounded = await paths.cleanupOrphans({ now: NOW, minimumAgeMs: 100, maxBytes: 5 });
    expect(fs.existsSync(oversized)).toBe(true);
    expect(bounded.warnings.some((warning) => warning.includes('byte budget'))).toBe(true);

    const runId = createRunId(NOW, '0000000000000103');
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', childCode('staging-lease', 'createStagingLease', `
const fs = await import('node:fs/promises');
    await fs.mkdir(${JSON.stringify(path.join(stagingRoot, 'service-a', runId))}, { recursive: true, mode: 0o700 });
await createStagingLease(${JSON.stringify(stagingRoot)}, 'service-a', ${JSON.stringify(runId)});
process.stdout.write('STAGED\\n', () => process.kill(process.pid, 'SIGKILL'));
`)], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    const childExit = waitForExit(child);
    await waitForOutput(child, 'STAGED');
    const exit = await childExit;
    expect(exit.signal).toBe('SIGKILL');
    const crashed = path.join(stagingRoot, 'service-a', runId);
    const leasePath = path.join(stagingRoot, '.leases', 'service-a', `${runId}.lease`);
    fs.writeFileSync(leasePath, JSON.stringify({ schemaVersion: 1, projectId: 'service-a', runId, pid: 99999999, createdAt: OLD.toISOString(), expiresAt: OLD.getTime() }));
    markOld(crashed); markOld(leasePath);
    await paths.cleanupOrphans({ now: NOW, minimumAgeMs: 100 });
    expect(fs.existsSync(crashed)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('turns a report-root inventory limit into a bounded warning', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-inventory-bound-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    const paths = new ArtifactPaths(reportRoot, stagingRoot);
    await paths.initialize();
    fs.writeFileSync(path.join(reportRoot, '.tmp-first'), 'partial');
    fs.writeFileSync(path.join(reportRoot, '.tmp-second'), 'partial');
    const result = await paths.cleanupOrphans({ now: NOW, maxEntries: 1 });
    expect(result.removed).toBe(0);
    expect(result.inspected).toBeLessThanOrEqual(1);
    expect(result.warnings.some((warning) => warning.includes('entry budget'))).toBe(true);
    expect(fs.existsSync(path.join(reportRoot, '.tmp-first'))).toBe(true);
    expect(fs.existsSync(path.join(reportRoot, '.tmp-second'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rolls back an interrupted aggregate publication before discovery', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-aggregate-recovery-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'artifacts'));
    await paths.initialize();
    const names = {
      journal: '.aggregate-publication-0000000000000001.json',
      stagedData: '.tmp-0000000000000002',
      stagedReport: '.tmp-aggregate-0000000000000003.html',
      backupData: '.bak-aggregate-data-0000000000000004',
      backupReport: '.bak-aggregate-report-0000000000000005',
    };
    fs.writeFileSync(path.join(reportRoot, 'aggregate-data.json'), 'new-data');
    fs.writeFileSync(path.join(reportRoot, 'index.html'), 'new-report');
    fs.writeFileSync(path.join(reportRoot, names.backupData), 'old-data');
    fs.writeFileSync(path.join(reportRoot, names.backupReport), 'old-report');
    fs.writeFileSync(path.join(reportRoot, names.stagedData), 'staged-data');
    fs.writeFileSync(path.join(reportRoot, names.stagedReport), 'staged-report');
    fs.writeFileSync(path.join(reportRoot, names.journal), JSON.stringify({
      schemaVersion: 1, committed: false, hadData: true, hadReport: true,
      stagedData: names.stagedData, stagedReport: names.stagedReport,
      backupData: names.backupData, backupReport: names.backupReport,
    }));
    await recoverAggregatePublication(reportRoot);
    expect(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8')).toBe('old-data');
    expect(fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8')).toBe('old-report');
    for (const name of Object.values(names)) expect(fs.existsSync(path.join(reportRoot, name))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsafe lifecycle limits and direct lease traversal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-lifecycle-contract-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'), path.join(root, 'artifacts'));
    await paths.initialize();
    await expect(paths.cleanupOrphans({ maxEntries: Number.NaN })).rejects.toThrow(/limits/u);
    await expect(paths.acquireReportRootLock({ leaseMs: Number.POSITIVE_INFINITY })).rejects.toThrow(/limits/u);
    expect(() => stagingLeasePath(path.join(root, 'artifacts'), '../outside', 'run')).toThrow(/filesystem-safe/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('waits for a second process and reclaims a dead same-host lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-report-lock-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    const paths = new ArtifactPaths(reportRoot, stagingRoot);
    await paths.initialize();
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', childCode('report-root-lock-owner', 'acquireReportRootLock', `
const lock = await acquireReportRootLock(${JSON.stringify(reportRoot)}, { leaseMs: 1000, heartbeatMs: 100, waitMs: 1000, pollIntervalMs: 20 });
console.log('LOCKED');
await new Promise((resolve) => setTimeout(resolve, 300));
await lock.release();
`)], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    const childExit = waitForExit(child);
    await waitForOutput(child, 'LOCKED');
    const started = Date.now();
    const lock = await paths.acquireReportRootLock({ leaseMs: 1000, heartbeatMs: 100, waitMs: 2000, pollIntervalMs: 20 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    await lock.release();
    expect((await childExit).code).toBe(0);

    const lockDirectory = path.join(reportRoot, '.report-root-lock');
    fs.mkdirSync(lockDirectory, { mode: 0o700 });
    fs.writeFileSync(path.join(lockDirectory, 'owner.json'), JSON.stringify({
      schemaVersion: 1, token: 'a'.repeat(32), pid: 99999999, hostname: os.hostname(),
      acquiredAt: OLD.toISOString(), expiresAt: OLD.getTime(),
    }));
    const recovered = await paths.acquireReportRootLock({ leaseMs: 1000, heartbeatMs: 100, waitMs: 500, pollIntervalMs: 20 });
    await recovered.release();
    expect(fs.existsSync(lockDirectory)).toBe(false);

    fs.mkdirSync(lockDirectory, { mode: 0o700 });
    const partialOwner = path.join(lockDirectory, '.owner.json.0000000000000006.tmp');
    fs.writeFileSync(partialOwner, '{');
    fs.writeFileSync(path.join(lockDirectory, '.claim.json'), JSON.stringify({
      schemaVersion: 1, pid: 99999999, hostname: os.hostname(), acquiredAt: OLD.toISOString(), expiresAt: OLD.getTime(),
    }));
    markOld(partialOwner); markOld(path.join(lockDirectory, '.claim.json')); markOld(lockDirectory);
    const recoveredInitial = await paths.acquireReportRootLock({ leaseMs: 1000, heartbeatMs: 100, waitMs: 500, pollIntervalMs: 20 });
    await recoveredInitial.release();
    expect(fs.existsSync(lockDirectory)).toBe(false);

    fs.mkdirSync(lockDirectory, { mode: 0o700 });
    fs.writeFileSync(path.join(lockDirectory, 'owner.json'), '{}');
    await expect(paths.acquireReportRootLock({ waitMs: 0 })).rejects.toThrow(/malformed/u);
    fs.rmSync(lockDirectory, { recursive: true, force: true });

    fs.mkdirSync(lockDirectory, { mode: 0o700 });
    fs.writeFileSync(path.join(lockDirectory, 'owner.json'), JSON.stringify({
      schemaVersion: 1, token: 'b'.repeat(32), pid: 99999999, hostname: 'foreign-host',
      acquiredAt: OLD.toISOString(), expiresAt: OLD.getTime(),
    }));
    await expect(paths.acquireReportRootLock({ waitMs: 0 })).rejects.toThrow(/locked/u);
    fs.rmSync(lockDirectory, { recursive: true, force: true });

    const outsideLock = path.join(root, 'outside-lock');
    fs.mkdirSync(outsideLock, { mode: 0o700 });
    fs.symlinkSync(outsideLock, lockDirectory);
    await expect(paths.acquireReportRootLock({ waitMs: 0 })).rejects.toThrow(/unsafe/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects overlapping report and staging roots before creating output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-root-overlap-'));
  try {
    await expect(new ArtifactPaths(root, path.join(root, 'staging')).initialize()).rejects.toThrow(/overlap/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
