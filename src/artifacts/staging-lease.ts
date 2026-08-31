import { constants } from 'node:fs';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SAFE_ID } from './artifact-identity.js';

export const STAGING_LEASE_DIRECTORY = '.leases';
export const STAGING_LEASE_DURATION_MS = 2 * 60 * 60 * 1_000;
const MAX_LEASE_BYTES = 4_096;

export interface StagingLease {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly runId: string;
  readonly pid: number;
  readonly createdAt: string;
  readonly expiresAt: number;
}

function assertSafeId(value: string, fieldName: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`${fieldName} is not filesystem-safe`);
}

async function ensureChildDirectory(parent: string, name: string): Promise<string> {
  const child = path.join(parent, name);
  try {
    await fs.mkdir(child, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = await fs.lstat(child);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(child) !== child) {
    throw new Error('Staging lease path contains a symbolic link or non-directory');
  }
  return child;
}

async function leaseParent(stagingRoot: string, projectId: string): Promise<string | undefined> {
  const leases = path.join(path.resolve(stagingRoot), STAGING_LEASE_DIRECTORY);
  const projectDirectory = path.join(leases, projectId);
  try {
    const leaseStat = await fs.lstat(leases);
    const projectStat = await fs.lstat(projectDirectory);
    if (!leaseStat.isDirectory() || leaseStat.isSymbolicLink() || !projectStat.isDirectory() || projectStat.isSymbolicLink() ||
      await fs.realpath(leases) !== leases || await fs.realpath(projectDirectory) !== projectDirectory) {
      throw new Error('Staging lease path is unsafe');
    }
    return projectDirectory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function stagingLeasePath(stagingRoot: string, projectId: string, runId: string): string {
  assertSafeId(projectId, 'project ID');
  assertSafeId(runId, 'run ID');
  return path.join(path.resolve(stagingRoot), STAGING_LEASE_DIRECTORY, projectId, `${runId}.lease`);
}

export async function createStagingLease(
  stagingRoot: string,
  projectId: string,
  runId: string,
  now = new Date(),
): Promise<void> {
  const leasePath = stagingLeasePath(stagingRoot, projectId, runId);
  const leases = await ensureChildDirectory(path.resolve(stagingRoot), STAGING_LEASE_DIRECTORY);
  const projectDirectory = await ensureChildDirectory(leases, projectId);
  const lease: StagingLease = {
    schemaVersion: 1,
    projectId,
    runId,
    pid: process.pid,
    createdAt: now.toISOString(),
    expiresAt: now.getTime() + STAGING_LEASE_DURATION_MS,
  };
  const temporary = path.join(projectDirectory, `.${runId}.lease.${crypto.randomBytes(8).toString('hex')}.tmp`);
  try {
    const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(`${JSON.stringify(lease)}\n`, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await fs.link(temporary, leasePath);
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}

export async function readStagingLease(
  stagingRoot: string,
  projectId: string,
  runId: string,
): Promise<StagingLease | undefined> {
  const leasePath = stagingLeasePath(stagingRoot, projectId, runId);
  if (await leaseParent(stagingRoot, projectId) === undefined) return undefined;
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(leasePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_LEASE_BYTES) throw new Error('Staging lease is oversized or not a file');
    const value: unknown = JSON.parse(await handle.readFile('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Staging lease is malformed');
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 1 || record.projectId !== projectId || record.runId !== runId ||
      typeof record.pid !== 'number' || !Number.isSafeInteger(record.pid) || record.pid < 1 ||
      typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) ||
      typeof record.expiresAt !== 'number' || !Number.isSafeInteger(record.expiresAt)) {
      throw new Error('Staging lease is malformed');
    }
    return record as unknown as StagingLease;
  } finally {
    await handle.close();
  }
}

export async function releaseStagingLease(
  stagingRoot: string,
  projectId: string,
  runId: string,
): Promise<void> {
  const leasePath = stagingLeasePath(stagingRoot, projectId, runId);
  await leaseParent(stagingRoot, projectId);
  try {
    const stat = await fs.lstat(leasePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Staging lease is unsafe');
    await fs.unlink(leasePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
