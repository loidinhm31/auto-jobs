import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { redactText, sanitizeUrl } from '../config-errors.js';
import type {
  DiscoveredRunManifest,
  ManifestDiscoveryResult,
  ProjectRunManifest,
} from './artifact-manifest.js';
import {
  isSafePersistedUrl,
  isValidFailureResult,
  isValidProjectResult,
  MAX_RUN_ARTIFACT_BYTES,
  MAX_RUN_ARTIFACT_COUNT,
} from './result-validation.js';

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,80}$/u;
const MAX_MANIFESTS = 5_000;
const MAX_MANIFEST_BYTES = 1_048_576;
const MAX_ARTIFACT_BYTES = 25 * 1_048_576;
const MAX_DIAGNOSTICS = 32;
const MAX_DIAGNOSTIC_LENGTH = 500;
const SAFE_ARTIFACT = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateManifest(
  value: unknown,
  projectId: string,
  buildNumber: number,
  runId: string,
): value is ProjectRunManifest {
  if (!isRecord(value) || value.kind !== 'project-run' || value.schemaVersion !== 2) return false;
  if (!isRecord(value.project) || value.project.id !== projectId || typeof value.project.name !== 'string') return false;
  if (!isRecord(value.run) || value.run.runId !== runId || typeof value.run.observedAt !== 'string') return false;
  if (!['success', 'partial', 'failed'].includes(String(value.state))) return false;
  if (!isRecord(value.jenkins) || value.jenkins.buildNumber !== buildNumber || typeof value.jenkins.buildUrl !== 'string' ||
    (value.jenkins.status !== undefined && typeof value.jenkins.status !== 'string')) return false;
  if (!isSafePersistedUrl(value.jenkins.buildUrl)) return false;
  if (!isRecord(value.artifacts) || value.artifacts.manifest !== 'manifest.json' || value.artifacts.data !== 'data.json' || !Array.isArray(value.artifacts.screenshots)) return false;
  if (!value.artifacts.screenshots.every((item) => typeof item === 'string' && SAFE_ARTIFACT.test(item))) return false;
  if (value.artifacts.trace !== undefined && value.artifacts.trace !== 'trace.zip') return false;
  if (!Array.isArray(value.warnings) || value.warnings.length > MAX_DIAGNOSTICS || !value.warnings.every((item) => typeof item === 'string' && item.length <= MAX_DIAGNOSTIC_LENGTH)) return false;
  if (value.diagnostic !== undefined && (typeof value.diagnostic !== 'string' || value.diagnostic.length > 2_000)) return false;
  if (value.diagnostics !== undefined) {
    if (!isRecord(value.diagnostics) || !Array.isArray(value.diagnostics.observationErrors) ||
      value.diagnostics.observationErrors.length > MAX_DIAGNOSTICS ||
      !value.diagnostics.observationErrors.every((item) => typeof item === 'string' && item.length <= MAX_DIAGNOSTIC_LENGTH) ||
      (value.diagnostics.lastSafeUrl !== undefined && !isSafePersistedUrl(value.diagnostics.lastSafeUrl)) ||
      (value.diagnostics.status !== undefined && typeof value.diagnostics.status !== 'string') ||
      typeof value.diagnostics.reloadCount !== 'number' || !Number.isSafeInteger(value.diagnostics.reloadCount) || value.diagnostics.reloadCount < 0) return false;
  }
  return true;
}

interface DiscoveryBudget { remaining: number; exhausted: boolean }

async function safeDirectories(
  directory: string,
  budget: DiscoveryBudget,
): Promise<string[]> {
  const names: string[] = [];
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    if (budget.remaining === 0) { budget.exhausted = true; break; }
    budget.remaining -= 1;
    if (entry.isDirectory() && !entry.isSymbolicLink()) names.push(entry.name);
  }
  return names.sort();
}

async function readManifest(filePath: string): Promise<unknown> {
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new Error('manifest size is invalid');
    return JSON.parse(await handle.readFile('utf8')) as unknown;
  } finally {
    await handle.close();
  }
}

async function readArtifact(
  directory: string,
  filename: string,
  budget?: { count: number; bytes: number },
): Promise<unknown> {
  const filePath = path.join(directory, filename);
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_ARTIFACT_BYTES) throw new Error('artifact size is invalid');
    if (budget !== undefined) {
      budget.count += 1;
      budget.bytes += stat.size;
    }
    if (filename === 'data.json') return JSON.parse(await handle.readFile('utf8')) as unknown;
    return undefined;
  } finally {
    await handle.close();
  }
}

function normalizedManifest(value: ProjectRunManifest): ProjectRunManifest {
  return {
    ...value,
    ...(value.jenkins === undefined ? {} : { jenkins: {
      ...value.jenkins, buildUrl: sanitizeUrl(value.jenkins.buildUrl),
      ...(value.jenkins.status === undefined ? {} : { status: redactText(value.jenkins.status).slice(0, 256) }),
    } }),
    warnings: value.warnings.map((item) => redactText(item).slice(0, MAX_DIAGNOSTIC_LENGTH)),
    ...(value.diagnostic === undefined ? {} : { diagnostic: redactText(value.diagnostic) }),
    ...(value.diagnostics === undefined ? {} : {
      diagnostics: {
        ...value.diagnostics,
        ...(value.diagnostics.lastSafeUrl === undefined ? {} : { lastSafeUrl: sanitizeUrl(value.diagnostics.lastSafeUrl) }),
        ...(value.diagnostics.status === undefined ? {} : { status: redactText(value.diagnostics.status).slice(0, 256) }),
        observationErrors: value.diagnostics.observationErrors.map((item) => redactText(item).slice(0, MAX_DIAGNOSTIC_LENGTH)),
      },
    }),
  };
}

async function validateReferencedArtifacts(
  directory: string,
  manifest: ProjectRunManifest,
): Promise<void> {
  const budget = { count: 0, bytes: 0 };
  const data = await readArtifact(directory, manifest.artifacts.data, budget);
  if (!isRecord(data) || data.schemaVersion !== 2 || !isRecord(data.project) || data.project.id !== manifest.project.id ||
    !isRecord(data.run) || data.run.runId !== manifest.run.runId || data.state !== manifest.state ||
    !isRecord(data.jenkins) || data.jenkins.buildNumber !== manifest.jenkins?.buildNumber ||
    data.jenkins.buildUrl !== manifest.jenkins?.buildUrl || typeof data.jenkins.buildUrl !== 'string') {
    throw new Error('manifest data identity mismatch');
  }
  if (!isSafePersistedUrl(data.jenkins.buildUrl) ||
    (manifest.state === 'failed' ? !isValidFailureResult(data) : !isValidProjectResult(data))) {
    throw new Error('invalid project result schema');
  }
  if (manifest.artifacts.screenshots.length > MAX_RUN_ARTIFACT_COUNT) throw new Error('artifact count is invalid');
  for (const screenshot of manifest.artifacts.screenshots) await readArtifact(directory, screenshot, budget);
  if (manifest.artifacts.trace !== undefined) await readArtifact(directory, manifest.artifacts.trace, budget);
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
  let inspected = 0;
  for (const projectId of await safeDirectories(root, budget)) {
    if (!SAFE_ID.test(projectId)) { warnings.push('ignored unsafe project artifact directory'); continue; }
    for (const buildName of await safeDirectories(path.join(root, projectId), budget)) {
      if (!/^\d+$/u.test(buildName) || Number(buildName) < 1) { warnings.push(`ignored invalid build directory for ${projectId}`); continue; }
      for (const runId of await safeDirectories(path.join(root, projectId, buildName), budget)) {
        if (inspected >= maximum) { warnings.push('manifest discovery limit reached'); return { manifests, warnings }; }
        inspected += 1;
        if (!SAFE_ID.test(runId)) { warnings.push(`ignored unsafe run directory for ${projectId}`); continue; }
        const manifestPath = path.join(root, projectId, buildName, runId, 'manifest.json');
        try {
          const value = await readManifest(manifestPath);
          const buildNumber = Number(buildName);
          if (!validateManifest(value, projectId, buildNumber, runId)) throw new Error('manifest identity mismatch');
          const directory = path.join(root, projectId, buildName, runId);
          await validateReferencedArtifacts(directory, value);
          manifests.push({
            manifest: normalizedManifest(value),
            relativeDirectory: [projectId, buildName, runId].join('/'),
            manifestPath,
          });
        } catch {
          warnings.push(`ignored invalid manifest for ${projectId}/${buildName}/${runId}`);
        }
      }
    }
  }
  if (budget.exhausted) warnings.push('artifact directory discovery limit reached');
  manifests.sort((left, right) => {
    const projectOrder = left.manifest.project.id.localeCompare(right.manifest.project.id);
    if (projectOrder !== 0) return projectOrder;
    const buildOrder = (left.manifest.jenkins?.buildNumber ?? 0) - (right.manifest.jenkins?.buildNumber ?? 0);
    return buildOrder !== 0 ? buildOrder : left.manifest.run.runId.localeCompare(right.manifest.run.runId);
  });
  return { manifests, warnings };
}
