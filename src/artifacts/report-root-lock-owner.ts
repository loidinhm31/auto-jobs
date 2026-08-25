import { constants, type Stats } from 'node:fs';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
export const REPORT_LOCK_DIRECTORY = '.report-root-lock';
export const REPORT_LOCK_RECOVERY_PREFIX = '.report-root-lock-recovery-';
export const REPORT_LOCK_LEASE_MS = 2 * 60 * 1_000;
export const REPORT_LOCK_HEARTBEAT_MS = 15 * 1_000;
export const REPORT_LOCK_WAIT_MS = 30 * 1_000;
const OWNER_FILE = 'owner.json';
const OWNER_TEMP = /^\.owner\.json\.[a-f\d]{16}\.tmp$/u;
const CLAIM_FILE = '.claim.json';
const CLAIM_TEMP = /^\.claim\.json\.[a-f\d]{16}\.tmp$/u;
const MAX_OWNER_BYTES = 4_096;
const MAX_INCOMPLETE_ENTRIES = 8;
export interface LockOwner {
  readonly schemaVersion: 1;
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly acquiredAt: string;
  readonly expiresAt: number;
}
interface LockClaim {
  readonly schemaVersion: 1; readonly pid: number; readonly hostname: string;
  readonly acquiredAt: string; readonly expiresAt: number;
}
export interface ReportRootLockOptions {
  readonly now?: () => number; readonly leaseMs?: number; readonly heartbeatMs?: number;
  readonly waitMs?: number; readonly pollIntervalMs?: number; readonly pid?: number; readonly hostname?: string;
}
export interface ReportRootLock { readonly release: () => Promise<void>; }
function lockPath(root: string): string { return path.join(path.resolve(root), REPORT_LOCK_DIRECTORY); }
export async function assertLockDirectory(directory: string): Promise<void> {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory) throw new Error('Report root lock directory is unsafe');
}
export async function readLockOwner(directory: string): Promise<LockOwner | undefined> {
  let handle: fs.FileHandle;
  try {
    await assertLockDirectory(directory);
    handle = await fs.open(path.join(directory, OWNER_FILE), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_OWNER_BYTES) throw new Error('Report root lock owner record is unsafe');
    const value: unknown = JSON.parse(await handle.readFile('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Report root lock owner record is malformed');
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 1 || typeof record.token !== 'string' || !/^[a-f\d]{32}$/u.test(record.token) || typeof record.pid !== 'number' ||
      !Number.isSafeInteger(record.pid) || record.pid < 1 || typeof record.hostname !== 'string' || record.hostname.length < 1 || record.hostname.length > 255 ||
      typeof record.acquiredAt !== 'string' || !Number.isFinite(Date.parse(record.acquiredAt)) || typeof record.expiresAt !== 'number' || !Number.isSafeInteger(record.expiresAt)) {
      throw new Error('Report root lock owner record is malformed');
    }
    return record as unknown as LockOwner;
  } finally { await handle.close(); }
}
async function writeOwnerFile(filename: string, owner: unknown): Promise<void> {
  const handle = await fs.open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8'); await handle.sync(); } finally { await handle.close(); }
}
async function readClaim(directory: string): Promise<LockClaim | undefined> {
  let handle: fs.FileHandle;
  try { handle = await fs.open(path.join(directory, CLAIM_FILE), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_OWNER_BYTES) throw new Error('Report root lock claim is unsafe');
    const value: unknown = JSON.parse(await handle.readFile('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Report root lock claim is malformed');
    const claim = value as Record<string, unknown>;
    if (claim.schemaVersion !== 1 || typeof claim.pid !== 'number' || !Number.isSafeInteger(claim.pid) || claim.pid < 1 || typeof claim.hostname !== 'string' ||
      claim.hostname.length < 1 || claim.hostname.length > 255 || typeof claim.acquiredAt !== 'string' || !Number.isFinite(Date.parse(claim.acquiredAt)) ||
      typeof claim.expiresAt !== 'number' || !Number.isSafeInteger(claim.expiresAt)) throw new Error('Report root lock claim is malformed');
    return claim as unknown as LockClaim;
  } finally { await handle.close(); }
}
async function writeLockClaim(directory: string, claim: LockClaim): Promise<void> {
  const temporary = path.join(directory, `.${CLAIM_FILE}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  try { await writeOwnerFile(temporary, claim); await fs.rename(temporary, path.join(directory, CLAIM_FILE)); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
}
async function boundedEntries(directory: string): Promise<import('node:fs').Dirent[]> {
  const handle = await fs.opendir(directory);
  const entries: import('node:fs').Dirent[] = [];
  try { for await (const entry of handle) { if (entries.length >= MAX_INCOMPLETE_ENTRIES) throw new Error('incomplete lock inventory is oversized'); entries.push(entry); } return entries; }
  finally { await handle.close().catch(() => undefined); }
}
export async function writeLockOwner(directory: string, owner: LockOwner, expectedToken?: string): Promise<boolean> {
  await assertLockDirectory(directory);
  if (expectedToken !== undefined && (await readLockOwner(directory))?.token !== expectedToken) return false;
  const temporary = path.join(directory, `.${OWNER_FILE}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  try {
    await writeOwnerFile(temporary, owner); await assertLockDirectory(directory);
    if (expectedToken !== undefined && (await readLockOwner(directory))?.token !== expectedToken) return false;
    await fs.rename(temporary, path.join(directory, OWNER_FILE));
    return true;
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}
function processIsDead(pid: number): boolean {
  try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
}
export async function reclaimStaleLock(root: string, owner: LockOwner, now: number, hostname: string): Promise<boolean> {
  if (owner.hostname !== hostname || owner.expiresAt > now || !processIsDead(owner.pid)) return false;
  const directory = lockPath(root);
  const current = await readLockOwner(directory);
  if (current?.token !== owner.token) return false;
  const recovery = path.join(root, `${REPORT_LOCK_RECOVERY_PREFIX}${crypto.randomBytes(8).toString('hex')}`);
  try { await fs.rename(directory, recovery); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  await fs.rm(recovery, { recursive: true, force: true });
  return true;
}
export async function reclaimIncompleteLock(root: string, now: number, leaseMs: number, hostname: string): Promise<boolean> {
  const directory = lockPath(root);
  let stat: Stats;
  try { stat = await fs.lstat(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory || stat.mtimeMs > now - leaseMs) return false;
  if (await readLockOwner(directory) !== undefined) return false;
  const claim = await readClaim(directory);
  if (claim === undefined || claim.hostname !== hostname || claim.expiresAt > now || !processIsDead(claim.pid)) return false;
  const entries = await boundedEntries(directory);
  if (entries.length > MAX_INCOMPLETE_ENTRIES || entries.some((entry) => !entry.isFile() || (entry.name !== CLAIM_FILE && !OWNER_TEMP.test(entry.name) && !CLAIM_TEMP.test(entry.name)))) return false;
  const recovery = path.join(root, `${REPORT_LOCK_RECOVERY_PREFIX}${crypto.randomBytes(8).toString('hex')}`);
  try { await fs.rename(directory, recovery); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  await fs.rm(recovery, { recursive: true, force: true });
  return true;
}
async function assertRoot(reportRoot: string): Promise<string> {
  const root = path.resolve(reportRoot);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(root) !== root) throw new Error('Report root lock requires a canonical directory');
  return root;
}
function currentTime(now: () => number): number { const value = now(); if (!Number.isSafeInteger(value)) throw new Error('Report root lock clock is invalid'); return value; }
function pause(durationMs: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, durationMs)); }
export async function acquireReportRootLock(reportRoot: string, options: ReportRootLockOptions = {}): Promise<ReportRootLock> {
  const root = await assertRoot(reportRoot);
  const now = options.now ?? Date.now;
  const leaseMs = options.leaseMs ?? REPORT_LOCK_LEASE_MS;
  const heartbeatMs = options.heartbeatMs ?? REPORT_LOCK_HEARTBEAT_MS;
  const waitMs = options.waitMs ?? REPORT_LOCK_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  const pid = options.pid ?? process.pid;
  const hostname = options.hostname ?? os.hostname();
  if (![leaseMs, heartbeatMs, waitMs, pollIntervalMs, pid].every(Number.isSafeInteger) || typeof hostname !== 'string' ||
    leaseMs < 1_000 || heartbeatMs < 100 || heartbeatMs >= leaseMs || waitMs < 0 || pollIntervalMs < 1 || pid < 1 ||
    hostname.length < 1 || hostname.length > 255) throw new Error('Report root lock limits are invalid');
  const deadline = currentTime(now) + waitMs;
  const directory = lockPath(root);
  for (;;) {
    try {
      await fs.mkdir(directory, { mode: 0o700 });
      const token = crypto.randomBytes(16).toString('hex');
      const acquiredAt = new Date(currentTime(now)).toISOString();
      const claim = { schemaVersion: 1 as const, pid, hostname, acquiredAt, expiresAt: currentTime(now) + leaseMs };
      try {
        await writeLockClaim(directory, claim);
        await writeLockOwner(directory, { schemaVersion: 1, token, pid, hostname, acquiredAt, expiresAt: claim.expiresAt });
        await fs.unlink(path.join(directory, CLAIM_FILE)).catch(() => undefined);
      } catch (error) {
        await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      let active = true;
      let heartbeatInFlight: Promise<void> = Promise.resolve();
      const heartbeat = setInterval(() => {
        heartbeatInFlight = heartbeatInFlight.then(async () => {
          if (!active) return;
          await writeLockOwner(directory, { schemaVersion: 1, token, pid, hostname, acquiredAt, expiresAt: currentTime(now) + leaseMs }, token);
        }).catch(() => undefined);
      }, heartbeatMs);
      heartbeat.unref?.();
      return {
        release: async () => {
          if (!active) return;
          active = false;
          clearInterval(heartbeat);
          await heartbeatInFlight;
          try {
            await assertLockDirectory(directory);
            if ((await readLockOwner(directory))?.token === token) await fs.rm(directory, { recursive: true, force: true });
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = await readLockOwner(directory);
      if (owner !== undefined && await reclaimStaleLock(root, owner, currentTime(now), hostname)) continue;
      if (owner === undefined && await reclaimIncompleteLock(root, currentTime(now), leaseMs, hostname)) continue;
      const remaining = deadline - currentTime(now);
      if (remaining <= 0) throw new Error('Report root is locked by another live or unsafe process');
      await pause(Math.min(pollIntervalMs, remaining));
    }
  }
}
