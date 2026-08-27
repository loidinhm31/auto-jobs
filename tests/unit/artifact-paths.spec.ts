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

test('ignores the runner lock directory during report discovery', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    fs.mkdirSync(path.join(paths.reportRoot, '.report-root-lock'));
    const result = await discoverRunManifests(paths.reportRoot);
    expect(result.manifests).toEqual([]);
    expect(result.warnings).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('moves an empty private staging run into its exact build folder', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000027');
    const stagingDirectory = await paths.allocateStaging('service-a', runId);
    const reportDirectory = await paths.allocateReport('service-a', 8, runId);

    expect(reportDirectory).toBe(path.join(paths.reportRoot, 'service-a', '8', runId));
    expect(fs.existsSync(stagingDirectory)).toBe(false);
    expect(fs.existsSync(stagingLeasePath(paths.stagingRoot, 'service-a', runId))).toBe(false);
    expect(fs.existsSync(reportDirectory)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps a successful publication when post-rename lease cleanup is unsafe', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000029');
    const stagingDirectory = await paths.allocateStaging('service-a', runId);
    const lease = stagingLeasePath(paths.stagingRoot, 'service-a', runId);
    const outside = path.join(root, 'outside-lease');
    fs.writeFileSync(outside, 'must survive');
    fs.unlinkSync(lease);
    fs.symlinkSync(outside, lease);

    const reportDirectory = await paths.publishPreBuild('service-a', runId);
    expect(fs.existsSync(reportDirectory.directory)).toBe(true);
    expect(fs.existsSync(stagingDirectory)).toBe(false);
    expect(fs.lstatSync(lease).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(outside, 'utf8')).toBe('must survive');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects non-empty private staging instead of leaving a stale run behind', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000028');
    const stagingDirectory = await paths.allocateStaging('service-a', runId);
    fs.writeFileSync(path.join(stagingDirectory, 'stale-screenshot.png'), 'stale');

    await expect(paths.allocateReport('service-a', 8, runId)).rejects.toThrow(/[Ss]taging.*empty|unsafe reuse/u);
    expect(fs.existsSync(path.join(paths.reportRoot, 'service-a', '8', runId))).toBe(false);
    expect(fs.existsSync(path.join(stagingDirectory, 'stale-screenshot.png'))).toBe(true);
    expect(fs.existsSync(stagingLeasePath(paths.stagingRoot, 'service-a', runId))).toBe(true);
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

test('accepts a real configured output root with caller-managed permissions', async () => {
  const root = temporaryRoot();
  try {
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    fs.mkdirSync(reportRoot, { recursive: true, mode: 0o755 });
    fs.mkdirSync(stagingRoot, { recursive: true, mode: 0o755 });
    fs.chmodSync(reportRoot, 0o755);
    fs.chmodSync(stagingRoot, 0o755);
    const reportMode = fs.statSync(reportRoot).mode & 0o777;
    const stagingMode = fs.statSync(stagingRoot).mode & 0o777;
    const paths = new ArtifactPaths(reportRoot, stagingRoot);
    await paths.initialize();
    expect(fs.statSync(paths.reportRoot).mode & 0o777).toBe(reportMode);
    expect(fs.statSync(paths.stagingRoot).mode & 0o777).toBe(stagingMode);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts existing non-private project, build, and staging directories', async () => {
  const root = temporaryRoot();
  try {
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    const reportBuild = path.join(reportRoot, 'service-a', '12');
    const stagingProject = path.join(stagingRoot, 'service-a');
    for (const directory of [reportRoot, stagingRoot, path.dirname(reportBuild), reportBuild, stagingProject]) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
      fs.chmodSync(directory, 0o755);
    }
    const paths = new ArtifactPaths(reportRoot, stagingRoot);
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000012');
    const stagingDirectory = await paths.allocateStaging('service-a', runId);
    const reportDirectory = await paths.allocateReport('service-a', 12, runId);
    expect(stagingDirectory).not.toBe(reportDirectory);
    expect(fs.existsSync(reportDirectory)).toBe(true);
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
