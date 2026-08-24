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
import { MAX_RUN_ARTIFACT_BYTES, MAX_RUN_ARTIFACT_COUNT } from './result-validation.js';

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

async function assertArtifactBudget(directory: string, manifest: ProjectRunManifest): Promise<void> {
  const references = [
    manifest.artifacts.data,
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
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 25 * 1_048_576) throw new Error('artifact size exceeds the safe limit');
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
): Promise<string> {
  assertProjectIdentity(manifest, result);
  const safe = safeResult(result);
  assertValidProjectResult(safe);
  await writeExclusive(directory, 'data.json', safe);
  await assertArtifactBudget(directory, manifest);
  return writeExclusive(directory, 'manifest.json', safeManifest(manifest));
}

export async function writeFailureManifest(
  directory: string,
  manifest: ProjectRunManifest,
): Promise<string> {
  assertManifestShape(manifest);
  await assertArtifactBudget(directory, manifest);
  return writeExclusive(directory, 'manifest.json', safeManifest(manifest));
}

export async function writeFailureResult(
  directory: string,
  result: ProjectFailureResultV2,
  manifest: ProjectRunManifest,
): Promise<string> {
  assertProjectIdentity(manifest, result);
  const safe = safeFailure(result);
  assertValidFailureResult(safe);
  await writeExclusive(directory, 'data.json', safe);
  await assertArtifactBudget(directory, manifest);
  return writeExclusive(directory, 'manifest.json', safeManifest(manifest));
}

export async function writeAggregateData(
  reportRoot: string,
  aggregate: AggregateReportResult,
): Promise<string> {
  return writeReplacing(reportRoot, 'aggregate-data.json', aggregate);
}
