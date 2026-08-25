import * as crypto from 'node:crypto';
import { constants } from 'node:fs';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ProjectRunManifest } from './artifact-manifest.js';
import { safeManifest } from './result-sanitizer.js';
import {
  isSafeScreenshotReference,
  MAX_RUN_ARTIFACT_BYTES,
  MAX_RUN_ARTIFACT_COUNT,
  MAX_RUN_ARTIFACT_DIRECTORY_BYTES,
  MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES,
  MAX_SINGLE_ARTIFACT_BYTES,
} from './result-validation.js';

async function readDirectoryEntries(directory: string): Promise<Dirent[]> {
  const handle = await fs.opendir(directory);
  const entries: Dirent[] = [];
  try {
    for await (const entry of handle) {
      entries.push(entry);
      if (entries.length > MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES) {
        throw new Error('run artifact directory has too many entries');
      }
    }
    return entries;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function directoryFileSize(directory: string, filename: string): Promise<number> {
  const handle = await fs.open(path.join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`run artifact allowlist rejected: ${filename}`);
    return stat.size;
  } finally {
    await handle.close();
  }
}

export async function assertRunArtifactAllowlist(
  directory: string,
  manifest: Pick<ProjectRunManifest, 'artifacts'>,
): Promise<readonly string[]> {
  const allowed = new Set([
    'data.json',
    'manifest.json',
    'index.html',
    ...manifest.artifacts.screenshots,
    ...(manifest.artifacts.trace === undefined ? [] : [manifest.artifacts.trace]),
  ]);
  const entries = await readDirectoryEntries(directory);
  const unexpected: string[] = [];
  let directoryBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !allowed.has(entry.name)) {
      unexpected.push(entry.name);
      continue;
    }
    directoryBytes += await directoryFileSize(directory, entry.name);
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

async function artifactSize(directory: string, filename: string): Promise<number | undefined> {
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(path.join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return undefined;
  }
  try {
    const stat = await handle.stat();
    return stat.isFile() && stat.size <= MAX_SINGLE_ARTIFACT_BYTES ? stat.size : undefined;
  } catch {
    return undefined;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function copyRegularArtifact(
  sourceDirectory: string,
  destinationDirectory: string,
  filename: string,
): Promise<void> {
  const source = await fs.open(path.join(sourceDirectory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  let destination: fs.FileHandle | undefined;
  try {
    const stat = await source.stat();
    if (!stat.isFile() || stat.size > MAX_SINGLE_ARTIFACT_BYTES) {
      throw new Error(`run artifact is not a bounded regular file: ${filename}`);
    }
    destination = await fs.open(
      path.join(destinationDirectory, filename),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, stat.size)));
    let position = 0;
    while (position < stat.size) {
      const read = await source.read(buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (read.bytesRead === 0) throw new Error(`run artifact changed while being staged: ${filename}`);
      await destination.write(buffer, 0, read.bytesRead, position);
      position += read.bytesRead;
    }
    await destination.sync();
  } finally {
    await destination?.close().catch(() => undefined);
    await source.close().catch(() => undefined);
  }
}

async function copyReferencedArtifacts(
  sourceDirectory: string,
  destinationDirectory: string,
  manifest: Pick<ProjectRunManifest, 'artifacts'>,
): Promise<void> {
  for (const filename of manifest.artifacts.screenshots) {
    if (!isSafeScreenshotReference(filename)) {
      throw new Error(`run artifact reference is unsafe: ${filename}`);
    }
    await copyRegularArtifact(sourceDirectory, destinationDirectory, filename);
  }
  if (manifest.artifacts.trace !== undefined) await copyRegularArtifact(sourceDirectory, destinationDirectory, manifest.artifacts.trace);
}

async function installPublishedDirectory(directory: string, stagingDirectory: string): Promise<void> {
  const backup = path.join(
    path.dirname(directory),
    `.run-backup-${crypto.randomBytes(8).toString('hex')}`,
  );
  let originalMoved = false;
  let replacementInstalled = false;
  try {
    await fs.rename(directory, backup);
    originalMoved = true;
    await fs.rename(stagingDirectory, directory);
    replacementInstalled = true;
    await fs.rm(backup, { recursive: true, force: true });
  } catch (error) {
    const rollbackErrors: string[] = [];
    if (replacementInstalled) {
      try { await fs.rm(directory, { recursive: true, force: true }); }
      catch (rollbackError) { rollbackErrors.push(`remove replacement: ${String(rollbackError)}`); }
    }
    if (originalMoved) {
      try { await fs.rename(backup, directory); }
      catch (rollbackError) { rollbackErrors.push(`restore original run: ${String(rollbackError)}`); }
    }
    const original = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(`run publication failed: ${original}; rollback incomplete: ${rollbackErrors.join('; ')}`);
    }
    throw error;
  }
}

async function assertFreshRunDirectory(directory: string): Promise<void> {
  const resolvedDirectory = path.resolve(directory);
  const parent = path.dirname(resolvedDirectory);
  const parentStat = await fs.lstat(parent);
  const directoryStat = await fs.lstat(resolvedDirectory);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() ||
    !directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('run publication directory must be a real directory');
  }
  if (await fs.realpath(parent) !== parent) throw new Error('run publication directory contains a symbolic-link component');
  for (const filename of ['data.json', 'index.html', 'manifest.json']) {
    try {
      await fs.lstat(path.join(resolvedDirectory, filename));
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
): Promise<void> {
  await assertFreshRunDirectory(directory);
  const resolvedDirectory = path.resolve(directory);
  const stagingDirectory = await fs.mkdtemp(path.join(path.dirname(resolvedDirectory), '.run-publication-'));
  try {
    await copyReferencedArtifacts(resolvedDirectory, stagingDirectory, manifest);
    await writePublishedFiles(stagingDirectory);
    await installPublishedDirectory(resolvedDirectory, stagingDirectory);
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function failureManifestWithAvailableArtifacts(
  directory: string,
  manifest: ProjectRunManifest,
): Promise<ProjectRunManifest> {
  const warnings = [...manifest.warnings];
  const screenshots: string[] = [];
  let bytes = 0;
  for (const candidate of manifest.artifacts.screenshots) {
    if (typeof candidate !== 'string' || !isSafeScreenshotReference(candidate)) {
      warnings.push('omitted unsafe screenshot artifact reference');
      continue;
    }
    if (screenshots.includes(candidate)) {
      warnings.push(`omitted duplicate screenshot artifact reference: ${candidate}`);
      continue;
    }
    if (screenshots.length >= MAX_RUN_ARTIFACT_COUNT) {
      warnings.push('omitted excess screenshot artifact reference');
      continue;
    }
    const filename = candidate;
    const size = await artifactSize(directory, filename);
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
    } else if (screenshots.length + 1 > MAX_RUN_ARTIFACT_COUNT) {
      warnings.push('omitted excess trace artifact reference');
    } else {
      const size = await artifactSize(directory, traceCandidate);
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
