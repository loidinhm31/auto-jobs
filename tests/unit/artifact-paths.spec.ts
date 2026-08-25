import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { discoverRunManifests } from '../../src/artifacts/aggregate-manifest-reader.js';
import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import type { ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { writeFailureManifest } from '../../src/artifacts/result-writer.js';

function temporaryRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'phase-03-artifacts-'));
}

function failedManifest(projectId: string, buildNumber: number, runId: string): ProjectRunManifest {
  return {
    kind: 'project-run', schemaVersion: 2,
    project: { id: projectId, name: projectId },
    run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
    state: 'failed',
    jenkins: { buildNumber, buildUrl: `https://jenkins.example/job/${projectId}/${buildNumber}/` },
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
    warnings: [], diagnostic: 'safe failure',
  };
}

async function writeCompleteFailureManifest(directory: string, value: ProjectRunManifest): Promise<void> {
  fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({
    schemaVersion: 2, project: value.project, run: value.run, state: value.state,
    jenkins: value.jenkins,
    diagnostic: value.diagnostic ?? 'safe failure', warnings: value.warnings,
  }));
  await writeFailureManifest(directory, value);
}

test('allocates immutable same-build run folders and discovers both exact manifests', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runA = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000001');
    const runB = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000002');
    const directoryA = await paths.allocateReport('service-a', 7, runA);
    const directoryB = await paths.allocateReport('service-a', 7, runB);
    await writeCompleteFailureManifest(directoryA, failedManifest('service-a', 7, runA));
    await writeCompleteFailureManifest(directoryB, failedManifest('service-a', 7, runB));

    expect(directoryA).not.toBe(directoryB);
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests.map((item) => item.relativeDirectory)).toEqual([
      `service-a/7/${runA}`,
      `service-a/7/${runB}`,
    ]);
    expect(result.warnings).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects traversal identities and ignores cross-run manifest reuse', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    await expect(paths.allocateStaging('../escape', 'safe-run')).rejects.toThrow(/filesystem-safe/u);
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000003');
    const directory = await paths.allocateReport('service-a', 8, runId);
    await writeCompleteFailureManifest(directory, failedManifest('service-b', 8, runId));
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.warnings[0]).toContain(`service-a/8/${runId}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not follow a symlinked run directory', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    const buildDirectory = path.join(paths.reportRoot, 'service-a', '9');
    fs.mkdirSync(buildDirectory, { recursive: true });
    fs.symlinkSync(outside, path.join(buildDirectory, 'linked-run'), 'dir');
    expect((await discoverRunManifests(paths.reportRoot)).manifests).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects configured output roots that are not owner-private', async () => {
  const root = temporaryRoot();
  try {
    const reportRoot = path.join(root, 'reports');
    fs.mkdirSync(reportRoot, { recursive: true, mode: 0o755 });
    fs.chmodSync(reportRoot, 0o755);
    await expect(new ArtifactPaths(reportRoot).initialize()).rejects.toThrow(/private|real directory/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects artifact traversal references and mismatched data identity', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000004');
    const directory = await paths.allocateReport('service-a', 10, runId);
    const value = failedManifest('service-a', 10, runId);
    fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({
      schemaVersion: 2, project: { id: 'service-b', name: 'Service B' },
      run: value.run, state: 'failed', diagnostic: 'safe', warnings: [],
    }));
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
      ...value, artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: ['../other.png'] },
    }));
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.warnings[0]).toContain('service-a/10');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects data copied from a different Jenkins build', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000005');
    const directory = await paths.allocateReport('service-a', 11, runId);
    const value = failedManifest('service-a', 11, runId);
    fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({
      schemaVersion: 2, project: value.project, run: value.run, state: value.state,
      jenkins: { buildNumber: 10, buildUrl: 'https://jenkins.example/job/service-a/10/' },
      diagnostic: 'safe', warnings: [],
    }));
    await writeFailureManifest(directory, value);
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.warnings[0]).toContain(`service-a/11/${runId}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects data with mismatched project name or run timestamp', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    for (const [index, mutation] of [
      { project: { name: 'Wrong Service' } },
      { run: { observedAt: '2026-08-24T05:00:00.000Z' } },
    ].entries()) {
      const runId = createRunId(new Date(`2026-08-24T04:00:0${index}.000Z`), `000000000000000${index + 6}`);
      const directory = await paths.allocateReport('service-a', 12 + index, runId);
      const value = failedManifest('service-a', 12 + index, runId);
      fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({
        schemaVersion: 2, project: { ...value.project, ...mutation.project }, run: { ...value.run, ...mutation.run },
        state: value.state, jenkins: value.jenkins, diagnostic: value.diagnostic, warnings: value.warnings,
      }));
      await writeFailureManifest(directory, value);
    }
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.warnings).toHaveLength(2);
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
