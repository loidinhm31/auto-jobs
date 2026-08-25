import * as crypto from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { AggregateReportResult, VulnerabilityReportResultV2 } from '../result-types.js';
import type { ProjectFailureResultV2, ProjectRunManifest } from './artifact-manifest.js';
import {
  assertManifestShape,
  assertProjectIdentity,
  assertValidFailureResult,
  assertValidProjectResult,
  safeFailure,
  safeManifest,
  safeResult,
} from './result-sanitizer.js';
import { MAX_RUN_ARTIFACT_BYTES, MAX_RUN_ARTIFACT_COUNT, MAX_SINGLE_ARTIFACT_BYTES } from './result-validation.js';
import { writeAggregateDataPair } from './aggregate-report-publisher.js';
import { assertRunArtifactAllowlist, failureManifestWithAvailableArtifacts } from './failure-artifact-inventory.js';
import { writeProjectReportFiles } from '../reporting/report-output.js';

async function writeTemporary(directory: string, contents: string): Promise<string> {
  const temporary = path.join(directory, `.tmp-${crypto.randomBytes(8).toString('hex')}`);
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function writeExclusive(
  directory: string,
  filename: string,
  value: unknown,
): Promise<string> {
  const destination = path.join(directory, filename);
  const temporary = await writeTemporary(directory, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await fs.link(temporary, destination);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
  return destination;
}

async function writeReplacing(
  directory: string,
  filename: string,
  value: unknown,
): Promise<string> {
  const destination = path.join(directory, filename);
  const temporary = await writeTemporary(directory, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
  return destination;
}

type RollbackEntry = { filename: 'data.json' | 'index.html' | 'manifest.json'; backupPath?: string };

async function backupExistingFile(
  directory: string,
  backupDirectory: string,
  filename: RollbackEntry['filename'],
): Promise<RollbackEntry> {
  const source = path.join(directory, filename);
  try {
    const stat = await fs.lstat(source);
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`existing ${filename} is not a file`);
    const backupPath = path.join(backupDirectory, filename);
    await fs.link(source, backupPath);
    return { filename, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { filename };
    throw error;
  }
}

async function restoreRollbackFiles(directory: string, entries: readonly RollbackEntry[]): Promise<void> {
  for (const entry of [...entries].reverse()) {
    const destination = path.join(directory, entry.filename);
    await fs.unlink(destination).catch(() => undefined);
    if (entry.backupPath !== undefined) await fs.rename(entry.backupPath, destination);
  }
}

async function publishExclusiveFile(temporary: string, destination: string): Promise<void> {
  try {
    await fs.link(temporary, destination);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function assertArtifactBudget(
  directory: string,
  manifest: ProjectRunManifest,
  includeData = true,
): Promise<void> {
  const references = [
    ...(includeData ? [manifest.artifacts.data] : []),
    ...manifest.artifacts.screenshots,
    ...(manifest.artifacts.trace === undefined ? [] : [manifest.artifacts.trace]),
  ];
  if (references.length > MAX_RUN_ARTIFACT_COUNT) throw new Error('run artifact count exceeds the safe limit');
  let bytes = 0;
  let inspected = 0;
  for (const filename of references) {
    const filePath = path.join(directory, filename);
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`referenced artifact is missing: ${filename}`);
      }
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_SINGLE_ARTIFACT_BYTES) throw new Error('artifact size exceeds the safe limit');
      inspected += 1;
      bytes += stat.size;
    } finally {
      await handle.close();
    }
  }
  if (inspected > MAX_RUN_ARTIFACT_COUNT || bytes > MAX_RUN_ARTIFACT_BYTES) {
    throw new Error('run artifact budget exceeded');
  }
}

export async function writeProjectResult(
  directory: string,
  result: VulnerabilityReportResultV2,
  manifest: ProjectRunManifest,
  reportRoot?: string,
): Promise<string> {
  assertProjectIdentity(manifest, result);
  const safe = safeResult(result);
  assertValidProjectResult(safe);
  const persistedManifest = safeManifest(manifest);
  await assertRunArtifactAllowlist(directory, persistedManifest);
  await assertArtifactBudget(directory, manifest, false);
  const stagedIndex = path.join(directory, `.tmp-index-${crypto.randomBytes(8).toString('hex')}.html`);
  let dataPublished = false;
  let indexPublished = false;
  let manifestPublished = false;
  try {
    await writeProjectReportFiles(directory, safe, persistedManifest, reportRoot, stagedIndex);
    await writeExclusive(directory, 'data.json', safe);
    dataPublished = true;
    await assertArtifactBudget(directory, manifest);
    await publishExclusiveFile(stagedIndex, path.join(directory, 'index.html'));
    indexPublished = true;
    const manifestPath = await writeExclusive(directory, 'manifest.json', persistedManifest);
    manifestPublished = true;
    await assertRunArtifactAllowlist(directory, persistedManifest);
    return manifestPath;
  } catch (error) {
    if (manifestPublished) await fs.unlink(path.join(directory, 'manifest.json')).catch(() => undefined);
    if (indexPublished) await fs.unlink(path.join(directory, 'index.html')).catch(() => undefined);
    if (dataPublished) await fs.unlink(path.join(directory, 'data.json')).catch(() => undefined);
    throw error;
  } finally {
    await fs.unlink(stagedIndex).catch(() => undefined);
  }
}

export async function writeFailureManifest(
  directory: string,
  manifest: ProjectRunManifest,
): Promise<string> {
  assertManifestShape(manifest);
  await assertRunArtifactAllowlist(directory, manifest);
  await assertArtifactBudget(directory, manifest);
  return writeExclusive(directory, 'manifest.json', safeManifest(manifest));
}

export async function writeFailureResult(
  directory: string,
  result: ProjectFailureResultV2,
  manifest: ProjectRunManifest,
  reportRoot?: string,
): Promise<string> {
  assertProjectIdentity(manifest, result, true);
  const safe = safeFailure(result);
  assertValidFailureResult(safe);
  let rollbackDirectory: string | undefined;
  const rollbackEntries: RollbackEntry[] = [];
  try {
    rollbackDirectory = await fs.mkdtemp(path.join(path.dirname(directory), '.failure-rollback-'));
    for (const filename of ['data.json', 'index.html', 'manifest.json'] as const) {
      rollbackEntries.push(await backupExistingFile(directory, rollbackDirectory, filename));
    }
    await writeReplacing(directory, 'data.json', safe);
    let persistedManifest = await failureManifestWithAvailableArtifacts(directory, manifest);
    assertManifestShape(persistedManifest);
    await fs.unlink(path.join(directory, 'index.html')).catch(() => undefined);
    if (manifest.jenkins !== undefined) {
      try {
        await writeProjectReportFiles(directory, safe, persistedManifest, reportRoot);
      } catch {
        persistedManifest = safeManifest({
          ...persistedManifest,
          warnings: [...persistedManifest.warnings, 'offline failure report rendering failed'],
        });
      }
    }
    await assertArtifactBudget(directory, persistedManifest);
    await assertRunArtifactAllowlist(directory, persistedManifest);
    return await writeReplacing(directory, 'manifest.json', persistedManifest);
  } catch (error) {
    await restoreRollbackFiles(directory, rollbackEntries);
    throw error;
  } finally {
    if (rollbackDirectory !== undefined) await fs.rm(rollbackDirectory, { recursive: true, force: true });
  }
}

export async function writeAggregateData(
  reportRoot: string,
  aggregate: AggregateReportResult,
): Promise<string> {
  return writeAggregateDataPair(reportRoot, aggregate);
}
