import * as crypto from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { AggregateReportResult, VulnerabilityReportResultV3 } from '../result-types.js';
import type { ProjectFailureResultV3, ProjectRunManifest } from './artifact-manifest.js';
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
import { withWorkflowDeadline, type WorkflowDeadline } from '../workflow/workflow-deadline.js';

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
      timer = setTimeout(() => reject(new Error('result cleanup exceeded workflow deadline')), timeoutMs);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function writeTemporary(directory: string, contents: string, deadline?: WorkflowDeadline): Promise<string> {
  requireDeadline(deadline);
  const temporary = path.join(directory, `.tmp-${crypto.randomBytes(8).toString('hex')}`);
  const handle = await bounded(() => fs.open(temporary, 'wx', 0o600), deadline);
  try {
    await bounded(() => handle.writeFile(contents, 'utf8'), deadline);
    requireDeadline(deadline);
    await bounded(() => handle.sync(), deadline);
    requireDeadline(deadline);
  } finally {
    await cleanupWithinRemaining(() => handle.close(), deadline).catch(() => undefined);
  }
  return temporary;
}

async function writeExclusive(
  directory: string,
  filename: string,
  value: unknown,
  deadline?: WorkflowDeadline,
): Promise<string> {
  requireDeadline(deadline);
  const destination = path.join(directory, filename);
  const temporary = await writeTemporary(directory, JSON.stringify(value, null, 2) + String.fromCharCode(10), deadline);
  try {
    requireDeadline(deadline);
    await bounded(() => fs.link(temporary, destination), deadline);
    requireDeadline(deadline);
  } finally {
    await cleanupWithinRemaining(() => fs.unlink(temporary), deadline).catch(() => undefined);
  }
  return destination;
}

async function assertArtifactBudget(
  directory: string,
  manifest: ProjectRunManifest,
  includeData = true,
  deadline?: WorkflowDeadline,
): Promise<void> {
  requireDeadline(deadline);
  const references = [
    ...(includeData ? [manifest.artifacts.data] : []),
    ...manifest.artifacts.screenshots,
    ...(manifest.artifacts.trace === undefined ? [] : [manifest.artifacts.trace]),
  ];
  if (references.length > MAX_RUN_ARTIFACT_COUNT) throw new Error('run artifact count exceeds the safe limit');
  let bytes = 0;
  let inspected = 0;
  for (const filename of references) {
    requireDeadline(deadline);
    const filePath = path.join(directory, filename);
    let handle: fs.FileHandle;
    try {
      handle = await bounded(() => fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW), deadline);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`referenced artifact is missing: ${filename}`);
      }
      throw error;
    }
    try {
      const stat = await bounded(() => handle.stat(), deadline);
      if (!stat.isFile() || stat.size > MAX_SINGLE_ARTIFACT_BYTES) throw new Error('artifact size exceeds the safe limit');
      inspected += 1;
      bytes += stat.size;
      requireDeadline(deadline);
    } finally {
      await cleanupWithinRemaining(() => handle.close(), deadline).catch(() => undefined);
    }
  }
  requireDeadline(deadline);
  if (inspected > MAX_RUN_ARTIFACT_COUNT || bytes > MAX_RUN_ARTIFACT_BYTES) {
    throw new Error('run artifact budget exceeded');
  }
}

export async function writeProjectResult(
  directory: string,
  result: VulnerabilityReportResultV3,
  manifest: ProjectRunManifest,
  reportRoot?: string,
  deadline?: WorkflowDeadline,
): Promise<string> {
  requireDeadline(deadline);
  assertProjectIdentity(manifest, result);
  const safe = safeResult(result);
  assertValidProjectResult(safe);
  const persistedManifest = safeManifest(manifest);
  await assertRunArtifactAllowlist(directory, persistedManifest, deadline);
  await assertArtifactBudget(directory, manifest, false, deadline);
  await publishCompleteRunDirectory(directory, persistedManifest, async (stagingDirectory) => {
    requireDeadline(deadline);
    await writeProjectReportFiles(stagingDirectory, safe, persistedManifest, reportRoot, undefined, deadline);
    await writeExclusive(stagingDirectory, 'data.json', safe, deadline);
    await assertArtifactBudget(stagingDirectory, persistedManifest, true, deadline);
    await writeExclusive(stagingDirectory, 'manifest.json', persistedManifest, deadline);
    await assertRunArtifactAllowlist(stagingDirectory, persistedManifest, deadline);
  }, deadline);
  return path.join(directory, 'manifest.json');
}

export async function writeFailureManifest(
  directory: string,
  manifest: ProjectRunManifest,
  deadline?: WorkflowDeadline,
): Promise<string> {
  requireDeadline(deadline);
  assertManifestShape(manifest);
  await assertRunArtifactAllowlist(directory, manifest, deadline);
  await assertArtifactBudget(directory, manifest, true, deadline);
  return writeExclusive(directory, 'manifest.json', safeManifest(manifest), deadline);
}

export async function writeFailureResult(
  directory: string,
  result: ProjectFailureResultV3,
  manifest: ProjectRunManifest,
  reportRoot?: string,
  deadline?: WorkflowDeadline,
): Promise<string> {
  requireDeadline(deadline);
  assertProjectIdentity(manifest, result, true);
  const safe = safeFailure(result);
  assertValidFailureResult(safe);
  let persistedManifest = await failureManifestWithAvailableArtifacts(directory, manifest, deadline);
  requireDeadline(deadline);
  assertManifestShape(persistedManifest);
  await assertArtifactBudget(directory, persistedManifest, false, deadline);
  await assertRunArtifactAllowlist(directory, persistedManifest, deadline);
  await publishCompleteRunDirectory(directory, persistedManifest, async (stagingDirectory) => {
    requireDeadline(deadline);
    await writeExclusive(stagingDirectory, 'data.json', safe, deadline);
    try {
      await writeProjectReportFiles(stagingDirectory, safe, persistedManifest, reportRoot, undefined, deadline);
    } catch {
      requireDeadline(deadline);
      persistedManifest = safeManifest({
        ...persistedManifest,
        warnings: [...persistedManifest.warnings, 'offline failure report rendering failed'],
      });
    }
    await assertArtifactBudget(stagingDirectory, persistedManifest, true, deadline);
    await writeExclusive(stagingDirectory, 'manifest.json', persistedManifest, deadline);
    await assertRunArtifactAllowlist(stagingDirectory, persistedManifest, deadline);
  }, deadline);
  return path.join(directory, 'manifest.json');
}


export async function writeAggregateData(
  reportRoot: string,
  aggregate: AggregateReportResult,
): Promise<string> {
  return writeAggregateDataPair(reportRoot, aggregate);
}
