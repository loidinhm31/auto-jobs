import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import type { ProjectFailureResultV3, ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { assertRunArtifactAllowlist } from '../../src/artifacts/failure-artifact-inventory.js';
import { discoverRunManifests } from '../../src/artifacts/aggregate-manifest-reader.js';
import { writeFailureManifest, writeFailureResult, writeProjectResult } from '../../src/artifacts/result-writer.js';
import { isValidFailureResult, isValidProjectResult, MAX_RUN_ARTIFACT_DIRECTORY_BYTES, MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES, MAX_RUN_OPTIONAL_ARTIFACT_COUNT } from '../../src/artifacts/result-validation.js';
import type { VulnerabilityReportResultV3 } from '../../src/result-types.js';

const JOB_URL = 'https://jenkins.example/job/service-a/';

type NavigationKey = 'jenkins-job' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues';

function validResult(runId: string): VulnerabilityReportResultV3 {
  const target = (key: NavigationKey) => ({ key, localAnchor: `#${key}`, state: 'found' as const });
  const source = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  const snykSource = { ...source, navigation: [target('snyk-report')] };
  const sonarqubeSource = {
    ...source,
    navigation: [target('sonarqube-home'), target('sonarqube-overall'), target('sonarqube-issues')],
  };
  return {
    schemaVersion: 3,
    state: 'success',
    project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
    jenkins: { jobUrl: JOB_URL },
    navigation: {
      'jenkins-job': target('jenkins-job'),
      'snyk-report': target('snyk-report'),
      'sonarqube-home': target('sonarqube-home'),
      'sonarqube-overall': target('sonarqube-overall'),
      'sonarqube-issues': target('sonarqube-issues'),
    },
    reports: { snyk: snykSource, sonarqube: sonarqubeSource },
    warnings: [],
  };
}

function validManifest(runId: string): ProjectRunManifest {
  return {
    kind: 'project-run',
    schemaVersion: 3,
    project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
    state: 'success',
    jenkins: { jobUrl: JOB_URL },
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
    warnings: [],
  };
}
function failedManifest(runId: string, screenshots: readonly string[] = []): ProjectRunManifest {
  const { jenkins: _jenkins, ...base } = validManifest(runId);
  return { ...base, state: 'failed', artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots } };
}

function temporaryRoot(prefix = 'phase-02-writer-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('writer rejects nested screenshot paths and incomplete direct navigation', async () => {
  const root = temporaryRoot();
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000006');
    const directory = await paths.allocateReport('service-a', runId);
    const manifest = validManifest(runId);
    const result = validResult(runId);
    const unsafe = {
      ...result,
      reports: { ...result.reports, snyk: {
        ...result.reports.snyk,
        captures: [{ url: 'https://snyk.example/report', capturedAt: result.run.observedAt, screenshotPath: '../other-project.png' }],
      } },
    } as VulnerabilityReportResultV3;
    await expect(writeProjectResult(directory, unsafe, manifest)).rejects.toThrow(/schema/u);

    const incomplete = { ...result, navigation: { ...result.navigation, 'snyk-report': undefined } } as unknown as VulnerabilityReportResultV3;
    await expect(writeProjectResult(directory, incomplete, manifest)).rejects.toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts direct schema-three Jenkins identity and rejects removed build fields', () => {
  const result = validResult('20260824t040000000z-0123456789abcdef');
  expect(isValidProjectResult(result)).toBe(true);
  expect(isValidProjectResult({ ...result, jenkins: { jobUrl: `${JOB_URL}?build=42` } })).toBe(false);
  expect(isValidProjectResult({ ...result, jenkins: { jobUrl: 'https://user:password@jenkins.example/job/service-a/' } })).toBe(false);
  expect(isValidProjectResult({ ...result, schemaVersion: 2 })).toBe(false);
});

test('rejects success results with incomplete evidence semantics', () => {
  const result = validResult('20260824t040000000z-0123456789abcdef');
  expect(isValidProjectResult({
    ...result,
    reports: { ...result.reports, snyk: { ...result.reports.snyk, state: 'incomplete' } },
  })).toBe(false);
  expect(isValidProjectResult({
    ...result,
    navigation: { ...result.navigation, 'sonarqube-issues': { ...result.navigation['sonarqube-issues'], state: 'incomplete' } },
  })).toBe(false);
  expect(isValidProjectResult({ ...result, warnings: ['capture warning'] })).toBe(false);
  expect(isValidProjectResult({
    ...result,
    reports: { ...result.reports, sonarqube: { ...result.reports.sonarqube, navigation: [] } },
  })).toBe(false);
});

test('validates direct failure identities without build or trigger state', () => {
  const result = validResult('20260824t040000000z-0123456789abcdef');
  const failure: ProjectFailureResultV3 = {
    schemaVersion: 3,
    project: result.project,
    run: result.run,
    state: 'failed',
    jenkins: { jobUrl: result.jenkins.jobUrl },
    diagnostic: 'capture failed',
    warnings: [],
  };
  expect(isValidFailureResult(failure)).toBe(true);
  expect(isValidFailureResult({ ...failure, jenkins: { jobUrl: 'https://jenkins.example/job/other-service/' } })).toBe(true);
  expect(isValidFailureResult({ ...failure, jenkins: { jobUrl: `${JOB_URL}?unsafe=1` } })).toBe(false);
  expect(isValidFailureResult({ ...failure, schemaVersion: 2 })).toBe(false);
});

test('failure manifest writer rejects too many artifact references', async () => {
  const root = temporaryRoot('phase-02-writer-budget-');
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000007');
    const directory = await paths.allocateReport('service-a', runId);
    const manifest = failedManifest(runId, Array.from({ length: 16 }, (_, index) => `shot-${index}.png`));
    await expect(writeFailureManifest(directory, manifest)).rejects.toThrow(/manifest contract/iu);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure manifest writer rejects a missing referenced screenshot', async () => {
  const root = temporaryRoot('phase-02-writer-missing-');
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000008');
    const directory = await paths.allocateReport('service-a', runId);
    fs.writeFileSync(path.join(directory, 'data.json'), '{}');
    const manifest = failedManifest(runId, ['missing.png']);
    await expect(writeFailureManifest(directory, manifest)).rejects.toThrow(/missing\.png/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persists the exact optional artifact count boundary', async () => {
  const root = temporaryRoot('phase-02-writer-artifact-boundary-');
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot);
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000027');
    const directory = await paths.allocateReport('service-a', runId);
    const screenshots = Array.from({ length: MAX_RUN_OPTIONAL_ARTIFACT_COUNT }, (_, index) => `shot-${index}.png`);
    for (const filename of screenshots) fs.writeFileSync(path.join(directory, filename), 'fixture');
    const result: ProjectFailureResultV3 = {
      schemaVersion: 3,
      project: { id: 'service-a', name: 'Service A' },
      run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
      state: 'failed',
      diagnostic: 'capture failed',
      warnings: [],
    };
    await writeFailureResult(directory, result, failedManifest(runId, screenshots), reportRoot);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as ProjectRunManifest;
    expect(saved.artifacts.screenshots).toHaveLength(MAX_RUN_OPTIONAL_ARTIFACT_COUNT);
    expect(fs.existsSync(path.join(directory, 'data.json'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects reserved and duplicate screenshot references', async () => {
  const root = temporaryRoot('phase-02-writer-reference-contract-');
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:06.000Z'), '0000000000000025');
    const directory = await paths.allocateReport('service-a', runId);
    const manifest = failedManifest(runId, ['data.json', 'shot.png', 'shot.png']);
    await expect(writeFailureManifest(directory, manifest)).rejects.toThrow(/artifact references/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('drops unknown result fields and rejects unknown manifest fields', async () => {
  const root = temporaryRoot('phase-02-writer-sanitizer-');
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:07.000Z'), '0000000000000026');
    const directory = await paths.allocateReport('service-a', runId);
    const unsafeManifest = { ...validManifest(runId), unknown: 'manifest-secret' } as ProjectRunManifest & { unknown: string };
    const baseResult = validResult(runId);
    const result = {
      ...baseResult,
      unknown: 'result-secret',
      jenkins: { ...baseResult.jenkins, unknown: 'jenkins-secret' },
      navigation: { ...baseResult.navigation, 'jenkins-job': { ...baseResult.navigation['jenkins-job'], unknown: 'navigation-secret' } },
    } as VulnerabilityReportResultV3 & { unknown: string };

    await expect(writeProjectResult(directory, result, unsafeManifest, reportRoot)).rejects.toThrow(/manifest contract/u);
    await writeProjectResult(directory, result, validManifest(runId), reportRoot);
    const savedResult = JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')) as Record<string, unknown>;
    const savedManifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect(savedResult.unknown).toBeUndefined();
    expect((savedResult.jenkins as Record<string, unknown>).unknown).toBeUndefined();
    expect(((savedResult.navigation as Record<string, unknown>)['jenkins-job'] as Record<string, unknown>).unknown).toBeUndefined();
    expect(savedManifest.unknown).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ignores schema-three manifests and results with unknown persisted keys', async () => {
  const root = temporaryRoot('phase-02-writer-unknown-history-');
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const writeHistorical = async (runId: string, manifest: unknown, data: unknown): Promise<void> => {
      const directory = await paths.allocateReport('service-a', runId);
      fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify(data));
      fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    };
    const firstRunId = createRunId(new Date('2026-08-24T04:00:08.000Z'), '0000000000000029');
    const firstResult = validResult(firstRunId);
    await writeHistorical(firstRunId, validManifest(firstRunId), {
      ...firstResult,
      reports: { ...firstResult.reports, snyk: { ...firstResult.reports.snyk, legacyBuild: '42' } },
    });
    const secondRunId = createRunId(new Date('2026-08-24T04:00:09.000Z'), '0000000000000031');
    await writeHistorical(secondRunId, { ...validManifest(secondRunId), legacyBuild: '42' }, validResult(secondRunId));

    const discovery = await discoverRunManifests(reportRoot);
    expect(discovery.manifests).toEqual([]);
    expect(discovery.ignoredIncompatibleCount).toBe(2);
    expect(discovery.warnings).toContain('ignored 2 incompatible historical manifest(s)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('writes and reads a complete screenshot artifact reference', async () => {
  const root = temporaryRoot('phase-02-writer-screenshot-');
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000009');
    const directory = await paths.allocateReport('service-a', runId);
    const screenshot = 'snyk-test-report.png';
    fs.writeFileSync(path.join(directory, screenshot), Buffer.from('png-fixture'));
    const manifest = failedManifest(runId, [screenshot]);
    fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({ schemaVersion: 3, project: { id: 'service-a', name: 'Service A' }, run: { runId, observedAt: '2026-08-24T04:00:00.000Z' }, state: 'failed', diagnostic: 'safe', warnings: [] }));
    await writeFailureManifest(directory, manifest);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as typeof manifest;
    expect(saved.artifacts.screenshots).toEqual([screenshot]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ignores malformed historical manifests before a valid direct run', async () => {
  const root = temporaryRoot('phase-02-writer-history-');
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const malformedRunId = createRunId(new Date('2026-08-24T04:00:10.000Z'), '0000000000000027');
    const malformedDirectory = await paths.allocateReport('service-a', malformedRunId);
    fs.writeFileSync(path.join(malformedDirectory, 'manifest.json'), '{"schemaVersion":3');
    const validRunId = createRunId(new Date('2026-08-24T04:00:11.000Z'), '0000000000000028');
    const validDirectory = await paths.allocateReport('service-a', validRunId);
    await writeProjectResult(validDirectory, validResult(validRunId), validManifest(validRunId), reportRoot);

    const discovery = await discoverRunManifests(reportRoot);
    expect(discovery.manifests.map((item) => item.manifest.run.runId)).toEqual([validRunId]);
    expect(discovery.ignoredIncompatibleCount).toBe(1);
    expect(discovery.warnings).toContain('ignored 1 incompatible historical manifest(s)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('ignores bounded and unsafe historical manifests while retaining a valid direct neighbor', async () => {
  const root = temporaryRoot('phase-02-writer-history-cases-');
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const makeRun = async (suffix: string): Promise<string> => {
      const runId = createRunId(new Date(`2026-08-24T04:01:${suffix}.000Z`), `00000000000000${suffix.replaceAll(':', '')}`);
      return paths.allocateReport('service-a', runId);
    };

    const oversizedDirectory = await makeRun('00');
    fs.writeFileSync(path.join(oversizedDirectory, 'manifest.json'), Buffer.alloc(1_048_577, 0x20));

    const symlinkDirectory = await makeRun('01');
    const symlinkTarget = path.join(root, 'historical-manifest.json');
    fs.writeFileSync(symlinkTarget, JSON.stringify(validManifest(path.basename(symlinkDirectory))));
    fs.symlinkSync(symlinkTarget, path.join(symlinkDirectory, 'manifest.json'));

    const unreadableDirectory = await makeRun('02');
    fs.mkdirSync(path.join(unreadableDirectory, 'manifest.json'));

    const malformedShapeDirectory = await makeRun('03');
    fs.writeFileSync(path.join(malformedShapeDirectory, 'manifest.json'), JSON.stringify({ schemaVersion: 3 }));

    const invalidDataDirectory = await makeRun('04');
    const invalidDataRunId = path.basename(invalidDataDirectory);
    fs.writeFileSync(path.join(invalidDataDirectory, 'manifest.json'), JSON.stringify(validManifest(invalidDataRunId)));

    const validRunId = createRunId(new Date('2026-08-24T04:01:05.000Z'), '0000000000000030');
    const validDirectory = await paths.allocateReport('service-a', validRunId);
    await writeProjectResult(validDirectory, validResult(validRunId), validManifest(validRunId), reportRoot);

    const discovery = await discoverRunManifests(reportRoot);
    expect(discovery.manifests.map((item) => item.manifest.run.runId)).toEqual([validRunId]);
    expect(discovery.ignoredIncompatibleCount).toBe(5);
    expect(discovery.warnings).toContain('ignored 5 incompatible historical manifest(s)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('rejects unreferenced run files while keeping the direct allowlist explicit', async () => {
  const root = temporaryRoot('phase-02-artifact-allowlist-');
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000010');
    const directory = await paths.allocateReport('service-a', runId);
    const screenshot = 'snyk-test-report.png';
    fs.writeFileSync(path.join(directory, screenshot), Buffer.from('png-fixture'));
    const manifest = { ...validManifest(runId), artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: [screenshot] } };
    await writeProjectResult(directory, validResult(runId), manifest, reportRoot);
    await expect(assertRunArtifactAllowlist(directory, manifest)).resolves.toEqual(['data.json', 'index.html', 'manifest.json', screenshot]);

    for (const filename of ['auth.json', 'capture.mp4', 'storage-state.json', 'unrequested.png', 'vendor.html']) fs.writeFileSync(path.join(directory, filename), 'forbidden fixture');
    await expect(assertRunArtifactAllowlist(directory, manifest)).rejects.toThrow(/auth\.json.*capture\.mp4.*storage-state\.json.*unrequested\.png.*vendor\.html/u);
    const discovery = await discoverRunManifests(reportRoot);
    expect(discovery.manifests).toHaveLength(0);
    expect(discovery.warnings).toContain('ignored invalid project run manifest');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bounds run-directory entries and bytes during allowlist validation', async () => {
  const root = temporaryRoot('phase-02-artifact-directory-budget-');
  try {
    const reportRoot = path.join(root, 'reports');
    const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:04.000Z'), '0000000000000023');
    const directory = await paths.allocateReport('service-a', runId);
    const manifest = validManifest(runId);
    await writeProjectResult(directory, validResult(runId), manifest, reportRoot);
    for (let index = 0; index < MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES; index += 1) fs.writeFileSync(path.join(directory, `extra-${index}.json`), 'extra fixture');
    await expect(assertRunArtifactAllowlist(directory, manifest)).rejects.toThrow(/too many entries/u);

    const byteRoot = temporaryRoot('phase-02-artifact-byte-budget-');
    try {
      const bytePaths = new ArtifactPaths(path.join(byteRoot, 'reports'), path.join(byteRoot, 'staging'));
      await bytePaths.initialize();
      const byteRunId = createRunId(new Date('2026-08-24T04:00:05.000Z'), '0000000000000024');
      const byteDirectory = await bytePaths.allocateReport('service-a', byteRunId);
      const byteManifest = validManifest(byteRunId);
      await writeProjectResult(byteDirectory, validResult(byteRunId), byteManifest, bytePaths.reportRoot);
      fs.truncateSync(path.join(byteDirectory, 'index.html'), MAX_RUN_ARTIFACT_DIRECTORY_BYTES + 1);
      await expect(assertRunArtifactAllowlist(byteDirectory, byteManifest)).rejects.toThrow(/byte budget/u);
    } finally {
      fs.rmSync(byteRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
