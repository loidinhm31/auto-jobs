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
import {
  assertRunArtifactAllowlist,
  failureManifestWithAvailableArtifacts,
  publishCompleteRunDirectory,
} from './failure-artifact-inventory.js';
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
  await publishCompleteRunDirectory(directory, persistedManifest, async (stagingDirectory) => {
    await writeProjectReportFiles(stagingDirectory, safe, persistedManifest, reportRoot);
    await writeExclusive(stagingDirectory, 'data.json', safe);
    await assertArtifactBudget(stagingDirectory, persistedManifest);
    await writeExclusive(stagingDirectory, 'manifest.json', persistedManifest);
    await assertRunArtifactAllowlist(stagingDirectory, persistedManifest);
  });
  return path.join(directory, 'manifest.json');
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
  let persistedManifest = await failureManifestWithAvailableArtifacts(directory, manifest);
  assertManifestShape(persistedManifest);
  await assertArtifactBudget(directory, persistedManifest, false);
  if (persistedManifest.artifacts.screenshots.length + (persistedManifest.artifacts.trace === undefined ? 0 : 1) >= MAX_RUN_ARTIFACT_COUNT) {
    throw new Error('run artifact count exceeds the safe limit');
  }
  await assertRunArtifactAllowlist(directory, persistedManifest);
  await publishCompleteRunDirectory(directory, persistedManifest, async (stagingDirectory) => {
    await writeExclusive(stagingDirectory, 'data.json', safe);
    if (manifest.jenkins !== undefined) {
      try {
        await writeProjectReportFiles(stagingDirectory, safe, persistedManifest, reportRoot);
      } catch {
        persistedManifest = safeManifest({
          ...persistedManifest,
          warnings: [...persistedManifest.warnings, 'offline failure report rendering failed'],
        });
      }
    }
    await assertArtifactBudget(stagingDirectory, persistedManifest);
    await writeExclusive(stagingDirectory, 'manifest.json', persistedManifest);
    await assertRunArtifactAllowlist(stagingDirectory, persistedManifest);
  });
  return path.join(directory, 'manifest.json');
}

export async function writeAggregateData(
  reportRoot: string,
  aggregate: AggregateReportResult,
): Promise<string> {
  return writeAggregateDataPair(reportRoot, aggregate);
}
