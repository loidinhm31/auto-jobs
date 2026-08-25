import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import type { ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { assertRunArtifactAllowlist } from '../../src/artifacts/failure-artifact-inventory.js';
import { discoverRunManifests } from '../../src/artifacts/aggregate-manifest-reader.js';
import { writeFailureManifest, writeProjectResult } from '../../src/artifacts/result-writer.js';
import { MAX_RUN_ARTIFACT_DIRECTORY_BYTES, MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES } from '../../src/artifacts/result-validation.js';
import type { VulnerabilityReportResultV2 } from '../../src/result-types.js';

function validResult(runId: string, buildNumber: number): VulnerabilityReportResultV2 {
  const buildUrl = `https://jenkins.example/job/service-a/${buildNumber}/`;
  const target = (key: 'jenkins-build' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues') => ({
    key, localAnchor: `#${key}`, state: 'found' as const,
  });
  const source = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  return {
    schemaVersion: 2, state: 'success', project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
    jenkins: {
      baseUrl: 'https://jenkins.example', jobPath: 'service-a', jobUrl: 'https://jenkins.example/job/service-a/',
      buildNumber, buildUrl, status: 'SUCCESS',
      trigger: { capability: 'existing_build', triggerAttempts: 0, build: { number: buildNumber, url: buildUrl }, warnings: [] },
    },
    navigation: {
      'jenkins-build': target('jenkins-build'), 'snyk-report': target('snyk-report'),
      'sonarqube-home': target('sonarqube-home'), 'sonarqube-overall': target('sonarqube-overall'),
      'sonarqube-issues': target('sonarqube-issues'),
    },
    reports: { snyk: source, sonarqube: source }, warnings: [],
  };
}

function validManifest(runId: string, buildNumber: number): ProjectRunManifest {
  return {
    kind: 'project-run', schemaVersion: 2, project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: '2026-08-24T04:00:00.000Z' }, state: 'success',
    jenkins: { buildNumber, buildUrl: `https://jenkins.example/job/service-a/${buildNumber}/` },
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] }, warnings: [],
  };
}

test('writer rejects nested screenshot paths and incomplete result navigation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-03-writer-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000006');
    const directory = await paths.allocateReport('service-a', 12, runId);
    const manifest = validManifest(runId, 12);
    const result = validResult(runId, 12);
    const unsafe = {
      ...result,
      reports: { ...result.reports, snyk: {
        ...result.reports.snyk,
        captures: [{ url: 'https://snyk.example/report', capturedAt: result.run.observedAt, screenshotPath: '../other-project.png' }],
      } },
    } as VulnerabilityReportResultV2;
    await expect(writeProjectResult(directory, unsafe, manifest)).rejects.toThrow(/schema/u);

    const incomplete = { ...result, navigation: { ...result.navigation, 'snyk-report': undefined } } as unknown as VulnerabilityReportResultV2;
    await expect(writeProjectResult(directory, incomplete, manifest)).rejects.toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure manifest writer rejects a run with too many artifact references', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-03-writer-budget-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000007');
    const directory = await paths.allocateReport('service-a', 13, runId);
    const manifest = {
      ...validManifest(runId, 13),
      state: 'failed' as const,
      artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: Array.from({ length: 16 }, (_, index) => `shot-${index}.png`) },
    };
    await expect(writeFailureManifest(directory, manifest)).rejects.toThrow(/artifact/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure manifest writer rejects a missing referenced screenshot', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-03-writer-missing-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000008');
    const directory = await paths.allocateReport('service-a', 14, runId);
    fs.writeFileSync(path.join(directory, 'data.json'), '{}');
    const manifest = {
      ...validManifest(runId, 14),
      state: 'failed' as const,
      artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: ['missing.png'] },
    };
    await expect(writeFailureManifest(directory, manifest)).rejects.toThrow(/missing\.png/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects reserved and duplicate screenshot references', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-writer-reference-contract-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:06.000Z'), '0000000000000025');
    const directory = await paths.allocateReport('service-a', 15, runId);
    const manifest = {
      ...validManifest(runId, 15),
      state: 'failed' as const,
      artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: ['data.json', 'shot.png', 'shot.png'] },
    };
    await expect(writeFailureManifest(directory, manifest)).rejects.toThrow(/artifact references/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('drops unknown fields before persisting results and manifests', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-writer-sanitizer-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:07.000Z'), '0000000000000026');
    const directory = await paths.allocateReport('service-a', 16, runId);
    const manifest = { ...validManifest(runId, 16), unknown: 'manifest-secret' } as ProjectRunManifest & { unknown: string };
    const baseResult = validResult(runId, 16);
    const result = {
      ...baseResult,
      unknown: 'result-secret',
      jenkins: { ...baseResult.jenkins, unknown: 'jenkins-secret' },
      navigation: { ...baseResult.navigation, 'jenkins-build': { ...baseResult.navigation['jenkins-build'], unknown: 'navigation-secret' } },
    } as VulnerabilityReportResultV2 & { unknown: string };

    await writeProjectResult(directory, result, manifest, reportRoot);
    const savedResult = JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')) as Record<string, unknown>;
    const savedManifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect(savedResult.unknown).toBeUndefined();
    expect((savedResult.jenkins as Record<string, unknown>).unknown).toBeUndefined();
    expect(((savedResult.navigation as Record<string, unknown>)['jenkins-build'] as Record<string, unknown>).unknown).toBeUndefined();
    expect(savedManifest.unknown).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('writes and reads a complete screenshot artifact reference', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-03-writer-screenshot-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000009');
    const directory = await paths.allocateReport('service-a', 15, runId);
    fs.writeFileSync(path.join(directory, 'data.json'), '{}');
    fs.writeFileSync(path.join(directory, 'snyk-test-report.png'), Buffer.from('png-fixture'));
    const manifest = {
      ...validManifest(runId, 15),
      artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: ['snyk-test-report.png'] },
    };
    await writeFailureManifest(directory, manifest);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as typeof manifest;
    expect(saved.artifacts.screenshots).toEqual(['snyk-test-report.png']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unreferenced run files and keeps the core artifact allowlist explicit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-artifact-allowlist-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000010');
    const directory = await paths.allocateReport('service-a', 16, runId);
    const screenshot = 'snyk-test-report.png';
    fs.writeFileSync(path.join(directory, screenshot), Buffer.from('png-fixture'));
    const manifest = { ...validManifest(runId, 16), artifacts: {
      manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: [screenshot],
    } };
    await writeProjectResult(directory, validResult(runId, 16), manifest, reportRoot);
    await expect(assertRunArtifactAllowlist(directory, manifest)).resolves.toEqual([
      'data.json', 'index.html', 'manifest.json', screenshot,
    ]);

    for (const filename of ['auth.json', 'capture.mp4', 'storage-state.json', 'unrequested.png', 'vendor.html']) {
      fs.writeFileSync(path.join(directory, filename), 'forbidden fixture');
    }
    fs.symlinkSync(path.join(root, 'outside-auth.png'), path.join(directory, 'auth.png'));
    await expect(assertRunArtifactAllowlist(directory, manifest)).rejects.toThrow(/auth\.json.*auth\.png.*capture\.mp4.*storage-state\.json.*unrequested\.png.*vendor\.html/u);
    const discovery = await discoverRunManifests(reportRoot);
    expect(discovery.manifests).toHaveLength(0);
    expect(discovery.warnings).toContain('ignored invalid manifest for service-a/16/' + runId);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bounds run-directory entries and bytes during allowlist validation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-artifact-directory-budget-'));
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:04.000Z'), '0000000000000023');
    const directory = await paths.allocateReport('service-a', 17, runId);
    const manifest = validManifest(runId, 17);
    await writeProjectResult(directory, validResult(runId, 17), manifest, reportRoot);
    for (let index = 0; index < MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES; index += 1) {
      fs.writeFileSync(path.join(directory, `extra-${index}.json`), 'extra fixture');
    }
    await expect(assertRunArtifactAllowlist(directory, manifest)).rejects.toThrow(/too many entries/u);

    const byteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-artifact-byte-budget-'));
    try {
      const bytePaths = new ArtifactPaths(path.join(byteRoot, 'reports'), path.join(byteRoot, 'staging'));
      await bytePaths.initialize();
      const byteRunId = createRunId(new Date('2026-08-24T04:00:05.000Z'), '0000000000000024');
      const byteDirectory = await bytePaths.allocateReport('service-a', 18, byteRunId);
      const byteManifest = validManifest(byteRunId, 18);
      await writeProjectResult(byteDirectory, validResult(byteRunId, 18), byteManifest, bytePaths.reportRoot);
      fs.truncateSync(path.join(byteDirectory, 'index.html'), MAX_RUN_ARTIFACT_DIRECTORY_BYTES + 1);
      await expect(assertRunArtifactAllowlist(byteDirectory, byteManifest)).rejects.toThrow(/byte budget/u);
    } finally {
      fs.rmSync(byteRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
