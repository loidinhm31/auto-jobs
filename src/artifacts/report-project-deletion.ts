import type { Stats } from 'node:fs';
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

export const MAX_PREFLIGHT_DEPTH = 32;
export const MAX_PREFLIGHT_ENTRIES = 4_096;
export const MAX_PREFLIGHT_BYTES = 256 * 1_048_576;
const RESERVED_PROJECT_IDS = new Set(['assets', '.report-root-lock']);

export class ProjectDeletionError extends Error {
  public constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ProjectDeletionError';
  }
}

export interface DeleteProjectDependencies {
  readonly removeDirectory?: (target: string) => Promise<void>;
  readonly publishAggregate?: (reportRoot: string, aggregate: AggregateReportResult) => Promise<string>;
}

export interface ProjectDeletionResult {
  readonly success: true;
  readonly projectId: string;
  readonly deletedRunsCount: number;
}

export function assertSafeProjectId(id: string): void {
  if (!SAFE_ID.test(id)) throw new ProjectDeletionError(400, 'INVALID_PROJECT_ID', 'project id is invalid');
  if (RESERVED_PROJECT_IDS.has(id) || id.startsWith('.') || id === 'assets') {
    throw new ProjectDeletionError(400, 'INVALID_PROJECT_ID', 'project id is a reserved name');
  }
}
interface PreflightBudget { entries: number; bytes: number; }

async function preflightTree(currentDir: string, depth: number, budget: PreflightBudget): Promise<void> {
  if (depth > MAX_PREFLIGHT_DEPTH) {
    throw new ProjectDeletionError(500, 'UNSAFE_PROJECT_DIRECTORY', 'project directory exceeds maximum folder depth');
  }
  const dirHandle = await fs.opendir(currentDir);
  try {
    for await (const dirent of dirHandle) {
      budget.entries += 1;
      if (budget.entries > MAX_PREFLIGHT_ENTRIES) {
        throw new ProjectDeletionError(500, 'UNSAFE_PROJECT_DIRECTORY', 'project directory exceeds maximum entries budget');
      }
      if (dirent.isSymbolicLink()) {
        throw new ProjectDeletionError(500, 'UNSAFE_PROJECT_DIRECTORY', 'project directory contains a symbolic link');
      }
      const fullChild = path.join(currentDir, dirent.name);
      const childStat = await fs.lstat(fullChild);
      if (childStat.isSymbolicLink()) {
        throw new ProjectDeletionError(500, 'UNSAFE_PROJECT_DIRECTORY', 'project directory contains a symbolic link');
      }
      if (childStat.isDirectory()) {
        await preflightTree(fullChild, depth + 1, budget);
      } else if (childStat.isFile()) {
        budget.bytes += childStat.size;
        if (budget.bytes > MAX_PREFLIGHT_BYTES) {
          throw new ProjectDeletionError(500, 'UNSAFE_PROJECT_DIRECTORY', 'project directory exceeds maximum bytes budget');
        }
      } else {
        throw new ProjectDeletionError(500, 'UNSAFE_PROJECT_DIRECTORY', 'project directory contains nonconforming filesystem entry');
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

export async function deleteProjectReports(
  reportRoot: string,
  projectId: string,
  dependencies: DeleteProjectDependencies = {},
): Promise<ProjectDeletionResult> {
  assertSafeProjectId(projectId);
  const paths = new ArtifactPaths(reportRoot);
  let lock: ReportRootLock | undefined;
  try {
    lock = await paths.acquireReportRootLock({ waitMs: 0 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Report root is locked')) {
      throw new ProjectDeletionError(409, 'REPORT_ROOT_LOCKED', 'report root is locked by another operation');
    }
    throw new ProjectDeletionError(500, 'LOCK_ERROR', error instanceof Error ? error.message : 'failed to acquire report root lock');
  }

  try {
    await recoverAggregatePublication(reportRoot);
    try {
      await assertReportRoot(reportRoot);
    } catch (error) {
      throw new ProjectDeletionError(500, 'INVALID_REPORT_ROOT', error instanceof Error ? error.message : 'invalid report root');
    }

    const initialDiscovery = await discoverRunManifests(reportRoot);
    if (initialDiscovery.incomplete) {
      throw new ProjectDeletionError(500, 'INCOMPLETE_DISCOVERY', 'cannot safely delete project reports because manifest discovery is incomplete');
    }

    const projectRuns = initialDiscovery.manifests.filter((m) => m.manifest.project.id === projectId);
    if (projectRuns.length === 0) {
      throw new ProjectDeletionError(404, 'PROJECT_NOT_FOUND', 'no validated retained reports found for project');
    }
    const deletedRunsCount = projectRuns.length;

    const resolvedRoot = path.resolve(reportRoot);
    const projectDir = path.resolve(resolvedRoot, projectId);
    const relative = path.relative(resolvedRoot, projectDir);
    if (relative !== projectId || path.isAbsolute(relative) || relative.startsWith('..')) {
      throw new ProjectDeletionError(400, 'INVALID_PROJECT_ID', 'project path escaped report root');
    }

    let stat: Stats;
    try {
      stat = await fs.lstat(projectDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ProjectDeletionError(404, 'PROJECT_NOT_FOUND', 'project directory not found');
      }
      throw err;
    }

    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new ProjectDeletionError(500, 'INVALID_PROJECT_DIRECTORY', 'project target is not a valid directory');
    }

    const canonicalRoot = await fs.realpath(resolvedRoot);
    const canonicalProject = await fs.realpath(projectDir);
    const relCanonical = path.relative(canonicalRoot, canonicalProject);
    const segments = relCanonical.split(path.sep);
    const firstSegment = segments[0];
    if (relCanonical === '' || relCanonical.startsWith('..') || path.isAbsolute(relCanonical) ||
        segments.length !== 1 || firstSegment === undefined || firstSegment.toLowerCase() !== projectId.toLowerCase()) {
      throw new ProjectDeletionError(500, 'INVALID_PROJECT_DIRECTORY', 'project directory escaped canonical root');
    }

    await preflightTree(projectDir, 1, { entries: 0, bytes: 0 });

    const preRemoveStat = await fs.lstat(projectDir);
    if (preRemoveStat.isSymbolicLink() || !preRemoveStat.isDirectory()) {
      throw new ProjectDeletionError(500, 'INVALID_PROJECT_DIRECTORY', 'project directory changed before removal');
    }

    try {
      if (dependencies.removeDirectory) {
        await dependencies.removeDirectory(projectDir);
      } else {
        await fs.rm(projectDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    } catch (removalError) {
      await attemptRefreshBestEffort(reportRoot).catch(() => undefined);
      throw new ProjectDeletionError(500, 'REMOVAL_FAILED', `failed to remove project directory: ${removalError instanceof Error ? removalError.message : String(removalError)}`);
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
      throw new ProjectDeletionError(500, 'REFRESH_FAILED', `project deleted but index refresh failed: ${publishError instanceof Error ? publishError.message : String(publishError)}${recoveryNote}`);
    }

    return { success: true, projectId, deletedRunsCount };
  } finally {
    await lock.release();
  }
}
