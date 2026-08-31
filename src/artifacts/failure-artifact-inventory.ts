import * as crypto from 'node:crypto';
import { constants } from 'node:fs';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ProjectRunManifest } from './artifact-manifest.js';
import { withWorkflowDeadline, type WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { safeManifest } from './result-sanitizer.js';
import {
  isSafeScreenshotReference,
  MAX_RUN_ARTIFACT_BYTES,
  MAX_RUN_ARTIFACT_DIRECTORY_BYTES,
  MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES,
  MAX_RUN_OPTIONAL_ARTIFACT_COUNT,
  MAX_SINGLE_ARTIFACT_BYTES,
} from './result-validation.js';

function requireDeadline(deadline?: WorkflowDeadline): void {
  deadline?.requireRemaining();
}

async function bounded<T>(operation: () => Promise<T>, deadline?: WorkflowDeadline): Promise<T> {
  return deadline === undefined ? operation() : withWorkflowDeadline(operation, deadline);
}

async function cleanupWithinRemaining<T>(operation: () => Promise<T>, deadline?: WorkflowDeadline): Promise<T> {
  if (deadline === undefined) return operation();
  const timeoutMs = Math.max(1, deadline.remainingMs());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('artifact cleanup exceeded workflow deadline')), timeoutMs);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readDirectoryEntries(directory: string, deadline?: WorkflowDeadline): Promise<Dirent[]> {
  const handle = await bounded(() => fs.opendir(directory), deadline);
  const entries: Dirent[] = [];
  try {
    for await (const entry of handle) {
      requireDeadline(deadline);
      entries.push(entry);
      if (entries.length > MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES) {
        throw new Error('run artifact directory has too many entries');
      }
    }
    return entries;
  } finally {
    await cleanupWithinRemaining(() => handle.close(), deadline).catch(() => undefined);
  }
}

async function directoryFileSize(
  directory: string,
  filename: string,
  deadline?: WorkflowDeadline,
): Promise<number> {
  const handle = await bounded(
    () => fs.open(path.join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW),
    deadline,
  );
  try {
    const stat = await bounded(() => handle.stat(), deadline);
    if (!stat.isFile()) throw new Error(`run artifact allowlist rejected: ${filename}`);
    return stat.size;
  } finally {
    await cleanupWithinRemaining(() => handle.close(), deadline).catch(() => undefined);
  }
}


export async function assertRunArtifactAllowlist(
  directory: string,
  manifest: Pick<ProjectRunManifest, 'artifacts'>,
  deadline?: WorkflowDeadline,
): Promise<readonly string[]> {
  const allowed = new Set([
    'data.json',
    'manifest.json',
    'index.html',
    ...manifest.artifacts.screenshots,
    ...(manifest.artifacts.trace === undefined ? [] : [manifest.artifacts.trace]),
  ]);
  requireDeadline(deadline);
  const entries = await bounded(() => readDirectoryEntries(directory, deadline), deadline);
  const unexpected: string[] = [];
  let directoryBytes = 0;
  for (const entry of entries) {
    requireDeadline(deadline);
    if (!entry.isFile() || entry.isSymbolicLink() || !allowed.has(entry.name)) {
      unexpected.push(entry.name);
      continue;
    }
    directoryBytes += await bounded(() => directoryFileSize(directory, entry.name, deadline), deadline);
    if (directoryBytes > MAX_RUN_ARTIFACT_DIRECTORY_BYTES) {
      throw new Error('run artifact directory byte budget exceeded');
    }
  }
  unexpected.sort();
  if (unexpected.length > 0) {
    throw new Error(`run artifact allowlist rejected: ${unexpected.join(', ')}`);
  }
  return entries.map((entry) => entry.name).sort();
}

async function artifactSize(
  directory: string,
  filename: string,
  deadline?: WorkflowDeadline,
): Promise<number | undefined> {
  let handle: fs.FileHandle;
  try {
    handle = await bounded(
      () => fs.open(path.join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW),
      deadline,
    );
  } catch {
    return undefined;
  }
  try {
    const stat = await bounded(() => handle.stat(), deadline);
    return stat.isFile() && stat.size <= MAX_SINGLE_ARTIFACT_BYTES ? stat.size : undefined;
  } catch {
    return undefined;
  } finally {
    await cleanupWithinRemaining(() => handle.close(), deadline).catch(() => undefined);
  }

}
async function copyRegularArtifact(
  sourceDirectory: string,
  destinationDirectory: string,
  filename: string,
  deadline?: WorkflowDeadline,
): Promise<void> {
  requireDeadline(deadline);
  const source = await bounded(
    () => fs.open(path.join(sourceDirectory, filename), constants.O_RDONLY | constants.O_NOFOLLOW),
    deadline,
  );
  let destination: fs.FileHandle | undefined;
  try {
    const stat = await bounded(() => source.stat(), deadline);
    if (!stat.isFile() || stat.size > MAX_SINGLE_ARTIFACT_BYTES) {
      throw new Error(`run artifact is not a bounded regular file: ${filename}`);
    }
    destination = await bounded(() => fs.open(
      path.join(destinationDirectory, filename),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    ), deadline);
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, stat.size)));
    let position = 0;
    while (position < stat.size) {
      requireDeadline(deadline);
      const read = await bounded(
        () => source.read(buffer, 0, Math.min(buffer.length, stat.size - position), position),
        deadline,
      );
      if (read.bytesRead === 0) throw new Error(`run artifact changed while being staged: ${filename}`);
      await bounded(() => destination!.write(buffer, 0, read.bytesRead, position), deadline);
      requireDeadline(deadline);
      position += read.bytesRead;
    }
    await bounded(() => destination!.sync(), deadline);
    requireDeadline(deadline);
  } finally {
    await cleanupWithinRemaining(() => destination?.close() ?? Promise.resolve(), deadline).catch(() => undefined);
    await cleanupWithinRemaining(() => source.close(), deadline).catch(() => undefined);
  }
}
async function copyReferencedArtifacts(
  sourceDirectory: string,
  destinationDirectory: string,
  manifest: Pick<ProjectRunManifest, 'artifacts'>,
  deadline?: WorkflowDeadline,
): Promise<void> {
  requireDeadline(deadline);
  for (const filename of manifest.artifacts.screenshots) {
    requireDeadline(deadline);
    if (!isSafeScreenshotReference(filename)) {
      throw new Error(`run artifact reference is unsafe: ${filename}`);
    }
    await copyRegularArtifact(sourceDirectory, destinationDirectory, filename, deadline);
  }
  if (manifest.artifacts.trace !== undefined) {
    requireDeadline(deadline);
    await copyRegularArtifact(sourceDirectory, destinationDirectory, manifest.artifacts.trace, deadline);
  }
}

async function installPublishedDirectory(
  directory: string,
  stagingDirectory: string,
  deadline?: WorkflowDeadline,
): Promise<void> {
  const backup = path.join(
    path.dirname(directory),
    `.run-backup-${crypto.randomBytes(8).toString('hex')}`,
  );
  let originalMoved = false;
  let replacementInstalled = false;
  try {
    await bounded(() => fs.rename(directory, backup), deadline);
    originalMoved = true;
    await bounded(() => fs.rename(stagingDirectory, directory), deadline);
    replacementInstalled = true;
    await bounded(() => fs.rm(backup, { recursive: true, force: true }), deadline);
  } catch (error) {
    const rollbackErrors: string[] = [];
    if (replacementInstalled) {
      try { await cleanupWithinRemaining(() => fs.rm(directory, { recursive: true, force: true }), deadline); }
      catch (rollbackError) { rollbackErrors.push(`remove replacement: ${String(rollbackError)}`); }
    }
    if (originalMoved) {
      try { await cleanupWithinRemaining(() => fs.rename(backup, directory), deadline); }
      catch (rollbackError) { rollbackErrors.push(`restore original run: ${String(rollbackError)}`); }
    }
    const original = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(`run publication failed: ${original}; rollback incomplete: ${rollbackErrors.join('; ')}`);
    }
    throw error;
  }
}

async function assertFreshRunDirectory(directory: string, deadline?: WorkflowDeadline): Promise<void> {
  const resolvedDirectory = path.resolve(directory);
  const parent = path.dirname(resolvedDirectory);
  const parentStat = await bounded(() => fs.lstat(parent), deadline);
  const directoryStat = await bounded(() => fs.lstat(resolvedDirectory), deadline);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() ||
    !directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('run publication directory must be a real directory');
  }
  if (await bounded(() => fs.realpath(parent), deadline) !== parent) {
    throw new Error('run publication directory contains a symbolic-link component');
  }
  for (const filename of ['data.json', 'index.html', 'manifest.json']) {
    requireDeadline(deadline);
    try {
      await bounded(() => fs.lstat(path.join(resolvedDirectory, filename)), deadline);
      throw new Error('run directory already contains published output; unsafe reuse rejected');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

/** Build a complete run beside the target, then install the directory as one unit. */
export async function publishCompleteRunDirectory(
  directory: string,
  manifest: Pick<ProjectRunManifest, 'artifacts'>,
  writePublishedFiles: (stagingDirectory: string) => Promise<void>,
  deadline?: WorkflowDeadline,
): Promise<void> {
  requireDeadline(deadline);
  await bounded(() => assertFreshRunDirectory(directory, deadline), deadline);
  requireDeadline(deadline);
  const resolvedDirectory = path.resolve(directory);
  const stagingDirectory = await bounded(
    () => fs.mkdtemp(path.join(path.dirname(resolvedDirectory), '.run-publication-')),
    deadline,
  );
  requireDeadline(deadline);
  try {
    await copyReferencedArtifacts(resolvedDirectory, stagingDirectory, manifest, deadline);
    requireDeadline(deadline);
    await bounded(() => writePublishedFiles(stagingDirectory), deadline);
    requireDeadline(deadline);
    await installPublishedDirectory(resolvedDirectory, stagingDirectory, deadline);
  } finally {
    await cleanupWithinRemaining(() => fs.rm(stagingDirectory, { recursive: true, force: true }), deadline).catch(() => undefined);
  }
}

export async function failureManifestWithAvailableArtifacts(
  directory: string,
  manifest: ProjectRunManifest,
  deadline?: WorkflowDeadline,
): Promise<ProjectRunManifest> {
  requireDeadline(deadline);
  const warnings = [...manifest.warnings];
  const screenshots: string[] = [];
  let bytes = 0;
  for (const candidate of manifest.artifacts.screenshots) {
    requireDeadline(deadline);
    if (typeof candidate !== 'string' || !isSafeScreenshotReference(candidate)) {
      warnings.push('omitted unsafe screenshot artifact reference');
      continue;
    }
    if (screenshots.includes(candidate)) {
      warnings.push(`omitted duplicate screenshot artifact reference: ${candidate}`);
      continue;
    }
    if (screenshots.length >= MAX_RUN_OPTIONAL_ARTIFACT_COUNT) {
      warnings.push('omitted excess screenshot artifact reference');
      continue;
    }
    const filename = candidate;
    requireDeadline(deadline);
    const size = await bounded(() => artifactSize(directory, filename, deadline), deadline);
    if (size === undefined || bytes + size > MAX_RUN_ARTIFACT_BYTES) {
      warnings.push(`omitted unavailable screenshot artifact: ${filename}`);
      continue;
    }
    screenshots.push(filename);
    bytes += size;
  }
  let trace: 'trace.zip' | undefined;
  const traceCandidate = manifest.artifacts.trace as unknown;
  if (traceCandidate !== undefined) {
    if (traceCandidate !== 'trace.zip') {
      warnings.push('omitted unsafe trace artifact reference');
    } else if (screenshots.length + 1 > MAX_RUN_OPTIONAL_ARTIFACT_COUNT) {
      warnings.push('omitted excess trace artifact reference');
    } else {
      const size = await bounded(() => artifactSize(directory, traceCandidate, deadline), deadline);
      requireDeadline(deadline);
      if (size === undefined || bytes + size > MAX_RUN_ARTIFACT_BYTES) {
        warnings.push(`omitted unavailable trace artifact: ${traceCandidate}`);
      } else {
        trace = traceCandidate;
      }
    }
  }
  return safeManifest({
    ...manifest,
    artifacts: {
      manifest: 'manifest.json',
      data: 'data.json',
      screenshots,
      ...(trace === undefined ? {} : { trace }),
    },
    warnings,
  });
}
