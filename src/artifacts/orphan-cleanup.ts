import type { Dirent, Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { readStagingLease, releaseStagingLease, STAGING_LEASE_DIRECTORY } from './staging-lease.js';
import { SAFE_ID } from './artifact-identity.js';
export const ORPHAN_MINIMUM_AGE_MS = 15 * 60 * 1_000;
export const CLEANUP_MAX_ENTRIES = 4_096;
export const CLEANUP_MAX_BYTES = 256 * 1_048_576;
export const CLEANUP_MAX_REMOVALS = 256;

const PUBLICATION_DIRECTORY = /^(?:\.run-publication-|\.run-backup-)/u;
const TEMP_ENTRY = /^(?:\.tmp-|\.bak-aggregate-|\.aggregate-publication-|\.report-root-lock-recovery-)/u;
const STAGING_LEASE_TEMP = /^\.[a-z0-9][a-z0-9-]{0,80}\.lease\.[a-f\d]{16}\.tmp$/u;
const STAGING_LEASE_FILE = /^([a-z0-9][a-z0-9-]{0,80})\.lease$/u;
const MAX_WARNINGS = 32;
const REPORT_INTERNAL_DIRECTORIES = new Set(['assets', '.report-root-lock']);
export interface OrphanCleanupOptions {
  readonly now?: Date; readonly minimumAgeMs?: number; readonly maxEntries?: number;
  readonly maxBytes?: number; readonly maxRemovals?: number;
}
export interface OrphanCleanupResult {
  readonly inspected: number; readonly removed: number; readonly warnings: readonly string[];
}
interface CleanupState {
  inspected: number; removed: number; bytes: number; warnings: string[];
  readonly options: Required<Pick<OrphanCleanupOptions, 'now' | 'minimumAgeMs' | 'maxEntries' | 'maxBytes' | 'maxRemovals'>>;
}
function addWarning(state: CleanupState, warning: string): void {
  if (state.warnings.length < MAX_WARNINGS) state.warnings.push(warning.slice(0, 300));
}
function safeChild(root: string, ...segments: string[]): string {
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(path.resolve(root), candidate);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('cleanup target escaped its configured root');
  return candidate;
}
async function assertRoot(root: string): Promise<string> {
  const resolved = path.resolve(root);
  const stat = await fs.lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(resolved) !== resolved) throw new Error('cleanup root is not a canonical directory');
  return resolved;
}
async function entries(directory: string, state: CleanupState): Promise<Dirent[]> {
  const handle = await fs.opendir(directory);
  const result: Dirent[] = [];
  try {
    for await (const entry of handle) {
      if (state.inspected >= state.options.maxEntries) throw new Error('cleanup entry budget exceeded');
      state.inspected += 1;
      result.push(entry);
    }
    return result;
  } finally {
    await handle.close().catch(() => undefined);
  }
}
function isOldEnough(stat: Stats, state: CleanupState): boolean {
  return stat.mtimeMs <= state.options.now.getTime() - state.options.minimumAgeMs;
}
async function measureTree(filename: string, state: CleanupState): Promise<void> {
  const stat = await fs.lstat(filename);
  if (stat.isSymbolicLink()) throw new Error('cleanup candidate contains a symbolic link');
  state.bytes += stat.isFile() ? stat.size : 0;
  if (state.bytes > state.options.maxBytes) throw new Error('cleanup byte budget exceeded');
  if (!stat.isDirectory()) return;
  const children = await entries(filename, state);
  for (const child of children) await measureTree(safeChild(filename, child.name), state);
}
async function removeCandidate(
  filename: string, allowedRoot: string, state: CleanupState,
): Promise<boolean> {
  const target = safeChild(allowedRoot, path.relative(allowedRoot, filename));
  if (state.removed >= state.options.maxRemovals) {
    addWarning(state, 'cleanup removal limit reached');
    return false;
  }
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink()) {
    addWarning(state, `preserved symlink cleanup candidate: ${path.basename(target)}`);
    return false;
  }
  if (!isOldEnough(stat, state)) return false;
  const previousBytes = state.bytes;
  try {
    await measureTree(target, state);
    await fs.rm(target, { recursive: stat.isDirectory(), force: false });
    state.removed += 1;
    return true;
  } catch (error) {
    state.bytes = previousBytes;
    addWarning(state, `preserved unsafe cleanup candidate ${path.basename(target)}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
async function cleanupLeaseEntries(leases: string, root: string, state: CleanupState): Promise<void> {
  let projects: Dirent[];
  try { projects = await entries(leases, state); } catch (error) { addWarning(state, `staging lease inventory failed: ${String(error)}`); return; }
  for (const project of projects) {
    if (!project.isDirectory() || project.isSymbolicLink() || !SAFE_ID.test(project.name)) continue;
    const projectPath = safeChild(leases, project.name);
    let temps: Dirent[];
    try { temps = await entries(projectPath, state); } catch (error) { addWarning(state, `staging lease project inventory failed: ${project.name}`); continue; }
    for (const temp of temps) {
      if (STAGING_LEASE_TEMP.test(temp.name)) {
        await removeCandidate(safeChild(projectPath, temp.name), root, state).catch((error) => addWarning(state, `staging lease cleanup failed: ${String(error)}`));
        continue;
      }
      const leaseMatch = STAGING_LEASE_FILE.exec(temp.name);
      if (leaseMatch === null) continue;
      const runId = leaseMatch[1]!;
      const runPath = safeChild(root, project.name, runId);
      try {
        const runStat = await fs.lstat(runPath);
        if (runStat.isSymbolicLink() || !runStat.isDirectory()) {
          addWarning(state, `preserved unsafe staging run for orphan lease: ${project.name}/${runId}`);
        }
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          addWarning(state, `preserved staging run for orphan lease: ${project.name}/${runId}`);
          continue;
        }
      }
      let lease;
      try { lease = await readStagingLease(root, project.name, runId); }
      catch { addWarning(state, `preserved malformed orphan staging lease: ${project.name}/${runId}`); continue; }
      if (lease === undefined || lease.expiresAt > state.options.now.getTime()) continue;
      await removeCandidate(safeChild(projectPath, temp.name), root, state).catch((error) => addWarning(state, `orphan staging lease cleanup failed: ${String(error)}`));
    }
  }
}
async function cleanupStagingRoot(root: string, state: CleanupState): Promise<void> {
  let projectEntries: Dirent[];
  try { projectEntries = await entries(root, state); }
  catch (error) { addWarning(state, `staging inventory failed: ${String(error)}`); return; }
  for (const project of projectEntries) {
    if (project.name === STAGING_LEASE_DIRECTORY) {
      if (project.isSymbolicLink()) addWarning(state, 'preserved symlink staging lease directory');
      else await cleanupLeaseEntries(safeChild(root, project.name), root, state);
      continue;
    }
    if (!project.isDirectory() || project.isSymbolicLink() || !SAFE_ID.test(project.name)) {
      addWarning(state, `ignored unsafe staging entry: ${project.name}`);
      continue;
    }
    const projectPath = safeChild(root, project.name);
    let runEntries: Dirent[];
    try { runEntries = await entries(projectPath, state); }
    catch (error) { addWarning(state, `staging project inventory failed: ${project.name}`); continue; }
    for (const run of runEntries) {
      if (!run.isDirectory() || run.isSymbolicLink() || !SAFE_ID.test(run.name)) {
        addWarning(state, `ignored unsafe staging run: ${project.name}/${run.name}`);
        continue;
      }
      const runPath = safeChild(projectPath, run.name);
      let lease;
      try { lease = await readStagingLease(root, project.name, run.name); }
      catch (error) { addWarning(state, `preserved malformed staging lease: ${project.name}/${run.name}`); continue; }
      if (lease !== undefined && lease.expiresAt > state.options.now.getTime()) continue;
      if (await removeCandidate(runPath, root, state)) {
        await releaseStagingLease(root, project.name, run.name).catch(() => undefined);
      }
    }
  }
}
async function cleanupPublicationEntries(
  directory: string,
  root: string,
  state: CleanupState,
  label: string,
): Promise<void> {
  let candidates: Dirent[];
  try { candidates = await entries(directory, state); }
  catch (error) { addWarning(state, `publication inventory failed: ${label}: ${String(error)}`); return; }
  for (const candidate of candidates) {
    if (!PUBLICATION_DIRECTORY.test(candidate.name)) continue;
    const candidatePath = safeChild(directory, candidate.name);
    if (candidate.name.startsWith('.run-backup-')) {
      addWarning(state, `preserved ambiguous publication backup: ${candidate.name}`);
      continue;
    }
    if (!candidate.isDirectory() || candidate.isSymbolicLink()) {
      addWarning(state, `preserved symlink or unsafe publication temporary: ${candidate.name}`);
      continue;
    }
    await removeCandidate(candidatePath, root, state).catch((error) => addWarning(state, `publication inventory failed: ${String(error)}`));
  }
}

async function cleanupReportRoot(root: string, state: CleanupState): Promise<void> {
  let rootEntries: Dirent[];
  try { rootEntries = await entries(root, state); } catch (error) { addWarning(state, `report root inventory failed: ${String(error)}`); return; }
  for (const entry of rootEntries) {
    const topLevel = safeChild(root, entry.name);
    if (TEMP_ENTRY.test(entry.name)) {
      if (entry.isSymbolicLink()) addWarning(state, `preserved symlink report temporary: ${entry.name}`);
      else await removeCandidate(topLevel, root, state).catch((error) => addWarning(state, `report temporary inventory failed: ${String(error)}`));
      continue;
    }
    if (entry.isSymbolicLink()) {
      addWarning(state, `preserved symlink report project entry: ${entry.name}`);
      continue;
    }
    if (!entry.isDirectory() || REPORT_INTERNAL_DIRECTORIES.has(entry.name) || !SAFE_ID.test(entry.name)) {
      if (entry.isDirectory() && !REPORT_INTERNAL_DIRECTORIES.has(entry.name)) {
        addWarning(state, `ignored unsafe report project entry: ${entry.name}`);
      }
      continue;
    }
    let projectEntries: Dirent[];
    try { projectEntries = await entries(topLevel, state); } catch (error) { addWarning(state, `report project inventory failed: ${entry.name}: ${String(error)}`); continue; }
    await cleanupPublicationEntries(topLevel, root, state, entry.name);
    for (const run of projectEntries) {
      if (run.isSymbolicLink()) {
        addWarning(state, `preserved symlink report run entry: ${entry.name}/${run.name}`);
        continue;
      }
      if (!run.isDirectory()) continue;
      if (!SAFE_ID.test(run.name)) {
        addWarning(state, `ignored unsafe report run entry: ${entry.name}/${run.name}`);
        continue;
      }
      const runPath = safeChild(topLevel, run.name);
      await cleanupPublicationEntries(runPath, root, state, `${entry.name}/${run.name}`);
    }
  }
}
export async function cleanupOrphans(
  reportRoot: string,
  stagingRoot: string,
  options: OrphanCleanupOptions = {},
): Promise<OrphanCleanupResult> {
  const normalized = {
    now: options.now ?? new Date(),
    minimumAgeMs: options.minimumAgeMs ?? ORPHAN_MINIMUM_AGE_MS,
    maxEntries: options.maxEntries ?? CLEANUP_MAX_ENTRIES,
    maxBytes: options.maxBytes ?? CLEANUP_MAX_BYTES,
    maxRemovals: options.maxRemovals ?? CLEANUP_MAX_REMOVALS,
  };
  if (!Number.isFinite(normalized.now.getTime()) ||
    ![normalized.minimumAgeMs, normalized.maxEntries, normalized.maxBytes, normalized.maxRemovals].every(Number.isSafeInteger) ||
    normalized.minimumAgeMs < 0 || normalized.maxEntries < 1 || normalized.maxBytes < 1 || normalized.maxRemovals < 1) {
    throw new Error('cleanup limits must be positive');
  }
  const state: CleanupState = { inspected: 0, removed: 0, bytes: 0, warnings: [], options: normalized };
  const report = await assertRoot(reportRoot);
  const staging = await assertRoot(stagingRoot);
  await cleanupStagingRoot(staging, state);
  await cleanupReportRoot(report, state);
  return { inspected: state.inspected, removed: state.removed, warnings: state.warnings };
}
