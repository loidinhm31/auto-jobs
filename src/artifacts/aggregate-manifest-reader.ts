import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { redactText, sanitizeUrl } from '../config-errors.js';
import { isRecord } from '../config-selectors.js';
import { SAFE_ID } from './artifact-identity.js';
import type {
  DiscoveredRunManifest,
  ManifestDiscoveryResult,
  ProjectRunManifest,
} from './artifact-manifest.js';
import {
  isSafeJenkinsJobUrl,
  isValidFailureResult,
  isValidManifestContract,
  isValidProjectResult,
  MAX_RUN_ARTIFACT_BYTES,
  MAX_RUN_ARTIFACT_COUNT,
  MAX_RUN_OPTIONAL_ARTIFACT_COUNT,
  MAX_SINGLE_ARTIFACT_BYTES,
} from './result-validation.js';
import { assertRunArtifactAllowlist } from './failure-artifact-inventory.js';
import { pushDiagnostic } from '../workflow/diagnostics.js';

const MAX_MANIFESTS = 5_000;
const MAX_MANIFEST_BYTES = 1_048_576;
const MAX_DIAGNOSTICS = 32;
const MAX_DIAGNOSTIC_LENGTH = 500;
export const MAX_DISCOVERY_ARTIFACT_BYTES = 250 * 1_048_576;
export const MAX_DISCOVERY_ARTIFACT_READS = 20_000;
const INTERNAL_DIRECTORIES = new Set(['.report-root-lock']);




interface DiscoveryBudget { remaining: number; exhausted: boolean }

interface DiscoveryArtifactBudget {
  count: number;
  bytes: number;
  exhausted: boolean;
}

function reserveDiscoveryArtifact(budget: DiscoveryArtifactBudget, size: number): void {
  if (budget.exhausted || budget.count >= MAX_DISCOVERY_ARTIFACT_READS ||
    budget.bytes > MAX_DISCOVERY_ARTIFACT_BYTES - size) {
    budget.exhausted = true;
    throw new Error('historical artifact discovery budget exceeded');
  }
  budget.count += 1;
  budget.bytes += size;
}

async function safeDirectories(
  directory: string,
  budget: DiscoveryBudget,
  onUnsafeEntry?: () => void,
): Promise<string[]> {
  const names: string[] = [];
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    if (budget.remaining === 0) { budget.exhausted = true; break; }
    budget.remaining -= 1;
    if (entry.isSymbolicLink()) {
      onUnsafeEntry?.();
      continue;
    }
    if (entry.isDirectory()) names.push(entry.name);
  }
  return names.sort();
}

async function readBoundedUtf8(handle: fs.FileHandle, expectedSize: number): Promise<string> {
  const buffer = Buffer.allocUnsafe(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    const read = await handle.read(buffer, 0, expectedSize - offset, offset);
    if (read.bytesRead === 0) throw new Error('artifact changed while being read');
    offset += read.bytesRead;
  }
  const finalStat = await handle.stat();
  if (!finalStat.isFile() || finalStat.size !== expectedSize) throw new Error('artifact changed while being read');
  return buffer.toString('utf8');
}

async function readManifest(
  filePath: string,
  discoveryBudget?: DiscoveryArtifactBudget,
): Promise<unknown> {
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new Error('manifest size is invalid');
    if (discoveryBudget !== undefined) reserveDiscoveryArtifact(discoveryBudget, stat.size);
    return JSON.parse(await readBoundedUtf8(handle, stat.size)) as unknown;
  } finally {
    await handle.close();
  }
}
 
interface ManifestReadResult {
  readonly present: boolean;
  readonly value?: unknown;
  readonly invalid: boolean;
}


async function readManifestIfPresent(
  filePath: string,
  discoveryBudget?: DiscoveryArtifactBudget,
): Promise<ManifestReadResult> {
  try {
    return { present: true, value: await readManifest(filePath, discoveryBudget), invalid: false };
  } catch (error) {
    if (discoveryBudget?.exhausted) return { present: true, invalid: true };
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { present: false, invalid: false };
    return { present: true, invalid: true };
  }
}

async function readArtifact(
  directory: string,
  filename: string,
  budget?: { count: number; bytes: number },
  discoveryBudget?: DiscoveryArtifactBudget,
): Promise<unknown> {
  if (discoveryBudget?.exhausted) throw new Error('historical artifact discovery budget exceeded');
  const filePath = path.join(directory, filename);
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_SINGLE_ARTIFACT_BYTES) throw new Error('artifact size is invalid');
    if (discoveryBudget !== undefined) reserveDiscoveryArtifact(discoveryBudget, stat.size);
    if (budget !== undefined) {
      budget.count += 1;
      budget.bytes += stat.size;
    }
    if (filename === 'data.json') return JSON.parse(await readBoundedUtf8(handle, stat.size)) as unknown;
    return undefined;
  } finally {
    await handle.close();
  }
}

async function optionalReportPath(directory: string): Promise<string | undefined> {
  const filename = path.join(directory, 'index.html');
  try {
    const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      return stat.isFile() ? filename : undefined;
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ELOOP') return undefined;
    throw error;
  }
}

function normalizedManifest(value: ProjectRunManifest): ProjectRunManifest {
  return {
    kind: 'project-run',
    schemaVersion: 3,
    project: { id: value.project.id, name: redactText(value.project.name).slice(0, 256) },
    run: { runId: value.run.runId, observedAt: value.run.observedAt },
    state: value.state,
    ...(value.jenkins === undefined ? {} : { jenkins: { jobUrl: sanitizeUrl(value.jenkins.jobUrl) } }),
    artifacts: {
      manifest: 'manifest.json',
      data: 'data.json',
      screenshots: [...value.artifacts.screenshots],
      ...(value.artifacts.trace === undefined ? {} : { trace: 'trace.zip' as const }),
    },
    warnings: value.warnings.map((item) => redactText(item).slice(0, MAX_DIAGNOSTIC_LENGTH)),
    ...(value.diagnostic === undefined ? {} : { diagnostic: redactText(value.diagnostic) }),
    ...(value.diagnostics === undefined ? {} : {
      diagnostics: {
        ...(value.diagnostics.lastSafeUrl === undefined ? {} : { lastSafeUrl: sanitizeUrl(value.diagnostics.lastSafeUrl) }),
        observationErrors: value.diagnostics.observationErrors.map((item) => redactText(item).slice(0, MAX_DIAGNOSTIC_LENGTH)),
      },
    }),
  };
}

async function validateReferencedArtifacts(
  directory: string,
  manifest: ProjectRunManifest,
  discoveryBudget: DiscoveryArtifactBudget,
): Promise<void> {
  const budget = { count: 0, bytes: 0 };
  const data = await readArtifact(directory, manifest.artifacts.data, budget, discoveryBudget);
  const dataRecord = isRecord(data) ? data : undefined;
  const dataJenkins = dataRecord !== undefined && isRecord(dataRecord.jenkins) ? dataRecord.jenkins : undefined;
  const jobIdentityMatches = manifest.jenkins === undefined
    ? dataJenkins === undefined
    : dataJenkins !== undefined && dataJenkins.jobUrl === manifest.jenkins.jobUrl;
  if (dataRecord === undefined || dataRecord.schemaVersion !== 3 || !isRecord(dataRecord.project) || dataRecord.project.id !== manifest.project.id || dataRecord.project.name !== manifest.project.name ||
    !isRecord(dataRecord.run) || dataRecord.run.runId !== manifest.run.runId || dataRecord.run.observedAt !== manifest.run.observedAt || dataRecord.state !== manifest.state ||
    !jobIdentityMatches) {
    throw new Error('manifest data identity mismatch');
  }
  if ((dataJenkins !== undefined && !isSafeJenkinsJobUrl(dataJenkins.jobUrl)) ||
    (manifest.state === 'failed' ? !isValidFailureResult(dataRecord) : !isValidProjectResult(dataRecord))) {
    throw new Error('invalid project result schema');
  }
  if (manifest.artifacts.screenshots.length > MAX_RUN_OPTIONAL_ARTIFACT_COUNT) throw new Error('artifact count is invalid');
  for (const screenshot of manifest.artifacts.screenshots) await readArtifact(directory, screenshot, budget, discoveryBudget);
  if (manifest.artifacts.trace !== undefined) await readArtifact(directory, manifest.artifacts.trace, budget, discoveryBudget);
  if (budget.count > MAX_RUN_ARTIFACT_COUNT || budget.bytes > MAX_RUN_ARTIFACT_BYTES) throw new Error('run artifact budget exceeded');
}

export async function discoverRunManifests(
  reportRoot: string,
  maximum = MAX_MANIFESTS,
): Promise<ManifestDiscoveryResult> {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_MANIFESTS) {
    throw new Error(`maximum manifests must be an integer between 1 and ${MAX_MANIFESTS}`);
  }
  const root = path.resolve(reportRoot);
  const manifests: DiscoveredRunManifest[] = [];
  const warnings: string[] = [];
  const budget: DiscoveryBudget = { remaining: Math.max(100, maximum * 4), exhausted: false };
  const artifactBudget: DiscoveryArtifactBudget = { count: 0, bytes: 0, exhausted: false };
  let inspected = 0;
  let ignoredIncompatibleCount = 0;
  let incompatibleLimitReached = false;
  const noteIncompatible = (): void => {
    if (ignoredIncompatibleCount < MAX_DIAGNOSTICS) {
      ignoredIncompatibleCount += 1;
    } else {
      incompatibleLimitReached = true;
    }
  };
  const inspectLegacyContainer = async (container: string): Promise<void> => {
    for (const runId of await safeDirectories(container, budget, noteIncompatible)) {
      if (artifactBudget.exhausted) return;
      if (inspected >= maximum) { warnings.push('manifest discovery limit reached'); return; }
      const read = await readManifestIfPresent(path.join(container, runId, 'manifest.json'), artifactBudget);
      if (artifactBudget.exhausted) return;
      if (!read.present) continue;
      inspected += 1;
      noteIncompatible();
    }
  };

  for (const projectId of await safeDirectories(root, budget, noteIncompatible)) {
    if (artifactBudget.exhausted) break;
    if (INTERNAL_DIRECTORIES.has(projectId)) continue;
    if (!SAFE_ID.test(projectId)) { pushDiagnostic(warnings, 'ignored unsafe project artifact directory'); continue; }
    const projectDirectory = path.join(root, projectId);
    for (const runId of await safeDirectories(projectDirectory, budget, noteIncompatible)) {
      if (artifactBudget.exhausted) break;
      if (inspected >= maximum) { warnings.push('manifest discovery limit reached'); return { manifests, warnings, ignoredIncompatibleCount }; }
      const directory = path.join(projectDirectory, runId);
      const manifestPath = path.join(directory, 'manifest.json');
      const read = await readManifestIfPresent(manifestPath, artifactBudget);
      if (artifactBudget.exhausted) break;
      if (!read.present) {
        await inspectLegacyContainer(directory);
        continue;
      }
      inspected += 1;
      if (read.invalid) {
        noteIncompatible();
        continue;
      }
      const value = read.value;
      if (!SAFE_ID.test(runId)) {
        noteIncompatible();
        continue;
      }
      if (!isRecord(value) || value.schemaVersion !== 3) {
        noteIncompatible();
        continue;
      }
      try {
        if (!isValidManifestContract(value, { expectedProjectId: projectId, expectedRunId: runId })) throw new Error('manifest identity mismatch');
        await validateReferencedArtifacts(directory, value, artifactBudget);
        await assertRunArtifactAllowlist(directory, value);
        const reportFile = await optionalReportPath(directory);
        manifests.push({
          manifest: normalizedManifest(value),
          relativeDirectory: [projectId, runId].join('/'),
          manifestPath,
          ...(reportFile === undefined ? {} : { reportPath: `${projectId}/${runId}/index.html` }),
        });
      } catch {
        noteIncompatible();
        pushDiagnostic(warnings, 'ignored invalid project run manifest');
      }
    }
  }
  if (artifactBudget.exhausted) pushDiagnostic(warnings, 'historical artifact discovery budget reached');
  if (budget.exhausted) pushDiagnostic(warnings, 'artifact directory discovery limit reached');
  if (ignoredIncompatibleCount > 0) {
    pushDiagnostic(
      warnings,
      `ignored ${incompatibleLimitReached ? `at least ${ignoredIncompatibleCount}` : ignoredIncompatibleCount} incompatible historical manifest(s)`,
    );
  }
  manifests.sort((left, right) => {
    const projectOrder = left.manifest.project.id.localeCompare(right.manifest.project.id);
    return projectOrder !== 0 ? projectOrder : left.manifest.run.runId.localeCompare(right.manifest.run.runId);
  });
  return { manifests, warnings, ignoredIncompatibleCount };
}
