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
