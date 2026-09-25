import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ArtifactPaths } from './artifact-paths.js';
import type { ReportRootLock } from './report-root-lock-owner.js';
import type { AggregateReportResult } from '../result-types.js';
import { discoverRunManifests } from './aggregate-manifest-reader.js';
import { buildAggregateIndex } from './aggregate-index-builder.js';
import { writeAggregateDataPair } from './aggregate-report-publisher.js';
import { recoverAggregatePublication } from './aggregate-publication-recovery.js';
import { assertReportRoot } from '../reporting/report-server-file-io.js';
import { SAFE_ID } from './artifact-identity.js';

export const MAX_RUN_PREFLIGHT_DEPTH = 32, MAX_RUN_PREFLIGHT_ENTRIES = 4_096, MAX_RUN_PREFLIGHT_BYTES = 256 * 1_048_576;
const RESERVED_NAMES = new Set(['assets', '.report-root-lock']);

export class RunDeletionError extends Error {
  public constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'RunDeletionError';
  }
}

export interface RunDeletionResult {
  readonly success: true; readonly projectId: string; readonly runId: string; readonly remainingRunsCount: number;
}

export interface DeleteRunDependencies {
  readonly removeDirectory?: (target: string) => Promise<void>;
  readonly publishAggregate?: (reportRoot: string, aggregate: AggregateReportResult) => Promise<string>;
}

export function assertSafeRunId(id: string): void {
  if (!SAFE_ID.test(id)) throw new RunDeletionError(400, 'INVALID_RUN_ID', 'run id is invalid');
  if (RESERVED_NAMES.has(id) || id.startsWith('.')) throw new RunDeletionError(400, 'INVALID_RUN_ID', 'run id is a reserved name');
}

interface PreflightBudget { entries: number; bytes: number; }

async function preflightRunTree(currentDir: string, depth: number, budget: PreflightBudget): Promise<void> {
  if (depth > MAX_RUN_PREFLIGHT_DEPTH) {
    throw new RunDeletionError(500, 'UNSAFE_RUN_DIRECTORY', 'run directory exceeds maximum folder depth');
  }
  const dirHandle = await fs.opendir(currentDir);
  try {
    for await (const dirent of dirHandle) {
      budget.entries += 1;
      if (budget.entries > MAX_RUN_PREFLIGHT_ENTRIES) {
        throw new RunDeletionError(500, 'UNSAFE_RUN_DIRECTORY', 'run directory exceeds maximum entries budget');
      }
      if (dirent.isSymbolicLink()) {
        throw new RunDeletionError(500, 'UNSAFE_RUN_DIRECTORY', 'run directory contains a symbolic link');
      }
      const fullChild = path.join(currentDir, dirent.name);
      const childStat = await fs.lstat(fullChild);
      if (childStat.isSymbolicLink()) {
        throw new RunDeletionError(500, 'UNSAFE_RUN_DIRECTORY', 'run directory contains a symbolic link');
      }
      if (childStat.isDirectory()) {
        await preflightRunTree(fullChild, depth + 1, budget);
      } else if (childStat.isFile()) {
        budget.bytes += childStat.size;
        if (budget.bytes > MAX_RUN_PREFLIGHT_BYTES) {
          throw new RunDeletionError(500, 'UNSAFE_RUN_DIRECTORY', 'run directory exceeds maximum bytes budget');
        }
      } else {
        throw new RunDeletionError(500, 'UNSAFE_RUN_DIRECTORY', 'run directory contains nonconforming filesystem entry');
      }
    }
  } finally {
    await dirHandle.close().catch(() => undefined);
  }
}

async function attemptRefreshBestEffort(reportRoot: string): Promise<void> {
  await recoverAggregatePublication(reportRoot);
  const surviving = await discoverRunManifests(reportRoot);
  if (!surviving.incomplete) {
    const aggregate = buildAggregateIndex({ discovery: surviving, warnings: surviving.warnings });
    await writeAggregateDataPair(reportRoot, aggregate);
  }
}

export async function deleteProjectRunReport(
  reportRoot: string, projectId: string, runId: string, dependencies: DeleteRunDependencies = {},
): Promise<RunDeletionResult> {
  if (!SAFE_ID.test(projectId) || RESERVED_NAMES.has(projectId) || projectId.startsWith('.')) {
    throw new RunDeletionError(400, 'INVALID_PROJECT_ID', 'project id is invalid');
  }
  assertSafeRunId(runId);

  const paths = new ArtifactPaths(reportRoot);
  let lock: ReportRootLock | undefined;
  try {
    lock = await paths.acquireReportRootLock({ waitMs: 0 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Report root is locked')) {
      throw new RunDeletionError(409, 'REPORT_ROOT_LOCKED', 'report root is locked by another operation');
    }
    throw new RunDeletionError(500, 'LOCK_ERROR', error instanceof Error ? error.message : 'failed to acquire report root lock');
  }

  try {
    await recoverAggregatePublication(reportRoot);
    try {
      await assertReportRoot(reportRoot);
    } catch (error) {
      throw new RunDeletionError(500, 'INVALID_REPORT_ROOT', error instanceof Error ? error.message : 'invalid report root');
    }

    const initialDiscovery = await discoverRunManifests(reportRoot);
    if (initialDiscovery.incomplete) {
      throw new RunDeletionError(500, 'INCOMPLETE_DISCOVERY', 'cannot safely delete report run because manifest discovery is incomplete');
    }

    const targetProjectRuns = initialDiscovery.manifests.filter((m) => m.manifest.project.id === projectId);
    const targetRun = targetProjectRuns.find((m) => m.manifest.run.runId === runId);
    if (!targetRun) throw new RunDeletionError(404, 'RUN_NOT_FOUND', 'no validated retained report run found');
    const remainingRunsCount = targetProjectRuns.length - 1;

    const resolvedRoot = path.resolve(reportRoot);
    const runDir = path.resolve(resolvedRoot, projectId, runId);
    const relative = path.relative(resolvedRoot, runDir);
    if (relative !== path.join(projectId, runId) || path.isAbsolute(relative) || relative.startsWith('..')) {
      throw new RunDeletionError(400, 'INVALID_RUN_ID', 'run path escaped report root');
    }

    const stat = await fs.lstat(runDir).catch((err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new RunDeletionError(404, 'RUN_NOT_FOUND', 'run directory not found');
      throw err;
    });

    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new RunDeletionError(500, 'INVALID_RUN_DIRECTORY', 'run target is not a valid directory');
    }

    const canonicalRoot = await fs.realpath(resolvedRoot);
    const canonicalRun = await fs.realpath(runDir);
    const relCanonical = path.relative(canonicalRoot, canonicalRun);
    const segments = relCanonical.split(path.sep);
    if (relCanonical === '' || relCanonical.startsWith('..') || path.isAbsolute(relCanonical) ||
        segments.length !== 2 || segments[0]?.toLowerCase() !== projectId.toLowerCase() ||
        segments[1]?.toLowerCase() !== runId.toLowerCase()) {
      throw new RunDeletionError(500, 'INVALID_RUN_DIRECTORY', 'run directory escaped canonical root');
    }

    await preflightRunTree(runDir, 1, { entries: 0, bytes: 0 });

    const preRemoveStat = await fs.lstat(runDir);
    if (preRemoveStat.isSymbolicLink() || !preRemoveStat.isDirectory()) {
      throw new RunDeletionError(500, 'INVALID_RUN_DIRECTORY', 'run directory changed before removal');
    }

    try {
      if (dependencies.removeDirectory) {
        await dependencies.removeDirectory(runDir);
      } else {
        await fs.rm(runDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    } catch (removalError) {
      await attemptRefreshBestEffort(reportRoot).catch(() => undefined);
      throw new RunDeletionError(500, 'REMOVAL_FAILED', `failed to remove run directory: ${removalError instanceof Error ? removalError.message : String(removalError)}`);
    }

    // If project directory has no more files/runs, prune empty project directory
    const projectDir = path.resolve(resolvedRoot, projectId);
    try {
      const remainingEntries = await fs.readdir(projectDir);
      if (remainingEntries.length === 0) {
        await fs.rmdir(projectDir).catch(() => undefined);
      }
    } catch {
      // Ignore if projectDir cannot be read or already gone
    }

    try {
      const postDiscovery = await discoverRunManifests(reportRoot);
      if (postDiscovery.incomplete) throw new Error('manifest discovery incomplete after deletion');
      const aggregate = buildAggregateIndex({ discovery: postDiscovery, warnings: postDiscovery.warnings });
      if (dependencies.publishAggregate) {
        await dependencies.publishAggregate(reportRoot, aggregate);
      } else {
        await writeAggregateDataPair(reportRoot, aggregate);
      }
    } catch (publishError) {
      let recoveryNote = '';
      try {
        await attemptRefreshBestEffort(reportRoot);
      } catch {
        recoveryNote = '; index may require recovery';
      }
      throw new RunDeletionError(500, 'REFRESH_FAILED', `run deleted but index refresh failed: ${publishError instanceof Error ? publishError.message : String(publishError)}${recoveryNote}`);
    }

    return { success: true, projectId, runId, remainingRunsCount };
  } finally {
    await lock.release();
  }
}
