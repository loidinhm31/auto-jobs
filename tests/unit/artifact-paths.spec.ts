import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { discoverRunManifests } from '../../src/artifacts/aggregate-manifest-reader.js';
import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import type { ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { writeFailureManifest } from '../../src/artifacts/result-writer.js';
import { stagingLeasePath } from '../../src/artifacts/staging-lease.js';

function temporaryRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'phase-02-artifacts-'));
}

function failedManifest(projectId: string, runId: string): ProjectRunManifest {
  return {
    kind: 'project-run',
    schemaVersion: 3,
    project: { id: projectId, name: projectId },
    run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
    state: 'failed',
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
    warnings: [],
    diagnostic: 'safe failure',
  };
}

async function writeCompleteFailureManifest(directory: string, value: ProjectRunManifest): Promise<void> {
  fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({
    schemaVersion: 3,
    project: value.project,
    run: value.run,
    state: value.state,
    diagnostic: value.diagnostic ?? 'safe failure',
    warnings: value.warnings,
  }));
  await writeFailureManifest(directory, value);
}

test('allocates immutable project/run folders and discovers direct manifests', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runA = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000001');
    const runB = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000002');
    const directoryA = await paths.allocateReport('service-a', runA);
    const directoryB = await paths.allocateReport('service-a', runB);
    await writeCompleteFailureManifest(directoryA, failedManifest('service-a', runA));
    await writeCompleteFailureManifest(directoryB, failedManifest('service-a', runB));

    expect(directoryA).not.toBe(directoryB);
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests.map((item) => item.relativeDirectory)).toEqual([
      `service-a/${runA}`,
      `service-a/${runB}`,
    ]);
    expect(result.ignoredIncompatibleCount).toBe(0);
    expect(result.warnings).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('moves an empty private staging run into its direct report folder', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000027');
    const stagingDirectory = await paths.allocateStaging('service-a', runId);
    const reportDirectory = await paths.allocateReport('service-a', runId);

    expect(reportDirectory).toBe(path.join(paths.reportRoot, 'service-a', runId));
    expect(fs.existsSync(stagingDirectory)).toBe(false);
    expect(fs.existsSync(stagingLeasePath(paths.stagingRoot, 'service-a', runId))).toBe(false);
    expect(fs.existsSync(reportDirectory)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects non-empty staging before direct report allocation', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000028');
    const stagingDirectory = await paths.allocateStaging('service-a', runId);
    fs.writeFileSync(path.join(stagingDirectory, 'stale-screenshot.png'), 'stale');

    await expect(paths.allocateReport('service-a', runId)).rejects.toThrow(/[Ss]taging.*empty|unsafe reuse/u);
    expect(fs.existsSync(path.join(paths.reportRoot, 'service-a', runId))).toBe(false);
    expect(fs.existsSync(path.join(stagingDirectory, 'stale-screenshot.png'))).toBe(true);
    expect(fs.existsSync(stagingLeasePath(paths.stagingRoot, 'service-a', runId))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('counts incompatible legacy build-folder manifests without migrating them', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = '20260824t040000000z-0123456789abcdef';
    const legacyDirectory = path.join(paths.reportRoot, 'service-a', '7', runId);
    fs.mkdirSync(legacyDirectory, { recursive: true });
    fs.writeFileSync(path.join(legacyDirectory, 'manifest.json'), JSON.stringify({
      kind: 'project-run', schemaVersion: 2, project: { id: 'service-a', name: 'service-a' },
      run: { runId, observedAt: '2026-08-24T04:00:00.000Z' }, state: 'failed', warnings: [],
    }));

    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.ignoredIncompatibleCount).toBe(1);
    expect(result.warnings).toContain('ignored 1 incompatible historical manifest(s)');
    expect(fs.existsSync(legacyDirectory)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects traversal identities and mismatched direct data identity', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    await expect(paths.allocateStaging('../escape', 'safe-run')).rejects.toThrow(/filesystem-safe/u);
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000003');
    const directory = await paths.allocateReport('service-a', runId);
    const value = failedManifest('service-a', runId);
    fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({
      schemaVersion: 3,
      project: { id: 'service-b', name: 'Service B' },
      run: value.run,
      state: value.state,
      diagnostic: 'safe',
      warnings: [],
    }));
    await writeFailureManifest(directory, value);
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.warnings).toContain('ignored invalid project run manifest');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not follow a symlinked direct run directory', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.mkdirSync(path.join(paths.reportRoot, 'service-a'), { recursive: true });
    fs.symlinkSync(outside, path.join(paths.reportRoot, 'service-a', 'linked-run'), 'dir');
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.ignoredIncompatibleCount).toBe(1);
    expect(result.warnings).toContain('ignored 1 incompatible historical manifest(s)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsafe manifest discovery limits', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    await expect(discoverRunManifests(paths.reportRoot, 0)).rejects.toThrow(/maximum manifests/u);
    await expect(discoverRunManifests(paths.reportRoot, Number.POSITIVE_INFINITY)).rejects.toThrow(/maximum manifests/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
