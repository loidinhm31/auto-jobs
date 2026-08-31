import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { acquireReportRootLock, type ReportRootLock, type ReportRootLockOptions } from './report-root-lock.js';
import { cleanupOrphans, type OrphanCleanupOptions, type OrphanCleanupResult } from './orphan-cleanup.js';
import { createStagingLease, releaseStagingLease } from './staging-lease.js';
import { WorkflowDeadlineExceededError, withWorkflowDeadline, type WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { SAFE_ID } from './artifact-identity.js';

function assertSafeId(value: string, fieldName: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`${fieldName} is not filesystem-safe`);
}

async function bounded<T>(operation: () => Promise<T>, deadline?: WorkflowDeadline): Promise<T> {
  return deadline === undefined ? operation() : withWorkflowDeadline(operation, deadline);
}


const ALLOCATION_SETTLE_TIMEOUT_MS = 5_000;

async function withHardTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('artifact allocation operation did not settle')), timeoutMs);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function boundedAllocation<T>(
  operation: () => Promise<T>,
  deadline?: WorkflowDeadline,
): Promise<T> {
  if (deadline === undefined) return operation();
  deadline.requireRemaining();
  const pending = operation();
  try {
    return await withWorkflowDeadline(() => pending, deadline);
  } catch (error) {
    if (!(error instanceof WorkflowDeadlineExceededError)) throw error;
    return withHardTimeout(() => pending, ALLOCATION_SETTLE_TIMEOUT_MS);
  }
}

async function ensureCanonicalDirectory(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  const root = path.parse(resolved).root;
  if (resolved === root) throw new Error('Output root must not be the filesystem root');
  let current = root;
  for (const segment of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      await fs.mkdir(current, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(current) !== current) {
      throw new Error('Output root must be a real directory without symbolic-link components');
    }
  }
}

function rootsOverlap(left: string, right: string): boolean {
  const relative = path.relative(left, right);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function ensureChildDirectory(parent: string, segment: string): Promise<string> {
  const child = path.join(parent, segment);
  try {
    await fs.mkdir(child, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = await fs.lstat(child);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Artifact path contains a symbolic link or non-directory');
  }
  return child;
}

async function allocateLeaf(parent: string, segment: string): Promise<string> {
  const leaf = path.join(parent, segment);
  await fs.mkdir(leaf, { mode: 0o700 });
  const stat = await fs.lstat(leaf);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Artifact leaf is not a directory');
  }
  return leaf;
}

async function assertDestinationAbsent(directory: string): Promise<void> {
  try {
    await fs.lstat(directory);
    throw new Error('Artifact run directory already exists; unsafe reuse rejected');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function moveEmptyStagingDirectory(source: string, destination: string): Promise<string | undefined> {
  try {
    const stat = await fs.lstat(source);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Staging run directory is unsafe');
    if ((await fs.readdir(source)).length > 0) throw new Error('Staging run directory must be empty before report allocation');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  await assertDestinationAbsent(destination);
  await fs.rename(source, destination);
  return destination;
}

async function releaseStagingLeaseBestEffort(
  stagingRoot: string,
  projectId: string,
  runId: string,
  deadline?: WorkflowDeadline,
): Promise<void> {
  try {
    await bounded(() => releaseStagingLease(stagingRoot, projectId, runId), deadline);
  } catch {
    // A successful publication is recoverable even when its lease cleanup is not.
    // The bounded orphan reaper will preserve unsafe leases and remove expired safe ones.
  }
}

export function createRunId(
  now: Date = new Date(),
  suffix: string = crypto.randomBytes(8).toString('hex'),
): string {
  const timestamp = now.toISOString().toLowerCase().replace(/[^0-9a-z]/gu, '');
  const normalizedSuffix = suffix.toLowerCase();
  if (!/^[0-9a-f]{8,64}$/u.test(normalizedSuffix)) {
    throw new Error('Run ID suffix must be collision-resistant hexadecimal');
  }
  return `${timestamp}-${normalizedSuffix}`;
}

export class ArtifactPaths {
  public readonly reportRoot: string;
  public readonly stagingRoot: string;

  public constructor(reportRoot: string, stagingRoot?: string) {
    this.reportRoot = path.resolve(reportRoot);
    this.stagingRoot = path.resolve(
      stagingRoot ?? path.join(path.dirname(this.reportRoot), 'artifacts'),
    );
  }

  public async initialize(): Promise<void> {
    if (rootsOverlap(this.reportRoot, this.stagingRoot) || rootsOverlap(this.stagingRoot, this.reportRoot)) throw new Error('Report and staging roots must not overlap');
    await ensureCanonicalDirectory(this.reportRoot);
    await ensureCanonicalDirectory(this.stagingRoot);
  }

  public async allocateStaging(projectId: string, runId: string, deadline?: WorkflowDeadline): Promise<string> {
    assertSafeId(projectId, 'project ID');
    assertSafeId(runId, 'run ID');
    const projectDirectory = await boundedAllocation(() => ensureChildDirectory(this.stagingRoot, projectId), deadline);
    const directory = await boundedAllocation(() => allocateLeaf(projectDirectory, runId), deadline);
    await boundedAllocation(() => createStagingLease(this.stagingRoot, projectId, runId), deadline);
    deadline?.requireRemaining();
    return directory;
  }

  public async allocateReport(
    projectId: string,
    runId: string,
    deadline?: WorkflowDeadline,
  ): Promise<string> {
    assertSafeId(projectId, 'project ID');
    assertSafeId(runId, 'run ID');
    const projectDirectory = await boundedAllocation(() => ensureChildDirectory(this.reportRoot, projectId), deadline);
    const destination = path.join(projectDirectory, runId);
    const stagingSource = path.join(this.stagingRoot, projectId, runId);
    const moved = await boundedAllocation(() => moveEmptyStagingDirectory(stagingSource, destination), deadline);
    await releaseStagingLeaseBestEffort(this.stagingRoot, projectId, runId, deadline);
    const allocated = moved ?? await boundedAllocation(() => allocateLeaf(projectDirectory, runId), deadline);
    return allocated;
  }

  public relativeToReportRoot(directory: string): string {
    const relative = path.relative(this.reportRoot, path.resolve(directory));
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Artifact directory is outside the report root');
    }
    return relative.split(path.sep).join('/');
  }

  public async cleanupOrphans(options?: OrphanCleanupOptions): Promise<OrphanCleanupResult> {
    return cleanupOrphans(this.reportRoot, this.stagingRoot, options);
  }

  public async releaseStagingLease(projectId: string, runId: string): Promise<void> {
    await releaseStagingLease(this.stagingRoot, projectId, runId);
  }

  public async acquireReportRootLock(options?: ReportRootLockOptions): Promise<ReportRootLock> {
    return acquireReportRootLock(this.reportRoot, options);
  }
}
