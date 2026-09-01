import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { discoverRunManifests, MAX_DISCOVERY_ARTIFACT_BYTES } from '../../src/artifacts/aggregate-manifest-reader.js';
import { assertManifestContract } from '../../src/artifacts/result-sanitizer.js';
import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import { writeAggregateData, writeFailureResult, writeProjectResult } from '../../src/artifacts/result-writer.js';
import type { ProjectFailureResultV3, ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { isValidAggregateResult, MAX_RUN_ARTIFACT_COUNT, MAX_SINGLE_ARTIFACT_BYTES } from '../../src/artifacts/result-validation.js';
import type { AggregateReportResult, VulnerabilityReportResultV3 } from '../../src/result-types.js';

const JOB_URL = 'https://jenkins.example/job/service-a/';
const OBSERVED_AT = '2026-08-24T04:00:00.000Z';
const SCREENSHOTS = ['snyk-test-report.png', 'sonarqube-overall.png', 'sonarqube-issues.png'] as const;

type NavigationKey = 'jenkins-job' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues';

function navigation(): VulnerabilityReportResultV3['navigation'] {
  const target = (key: NavigationKey, localAnchor: string, liveUrl?: string) => ({
    key, localAnchor, state: 'found' as const, ...(liveUrl === undefined ? {} : { liveUrl }),
  });
  return {
    'jenkins-job': target('jenkins-job', '#jenkins', JOB_URL),
    'snyk-report': target('snyk-report', '#snyk-test-report', 'https://snyk.example/report'),
    'sonarqube-home': target('sonarqube-home', '#sonarqube-home', 'https://sonar.example/dashboard?id=service-a'),
    'sonarqube-overall': target('sonarqube-overall', '#sonarqube-overall', 'https://sonar.example/dashboard?id=service-a&codeScope=overall'),
    'sonarqube-issues': target('sonarqube-issues', '#sonarqube-issues', 'https://sonar.example/project/issues?id=service-a'),
  };
}

function completeResult(runId: string): VulnerabilityReportResultV3 {
  const nav = navigation();
  return {
    schemaVersion: 3, state: 'success', project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: OBSERVED_AT }, jenkins: { jobUrl: JOB_URL }, navigation: nav,
    reports: {
      snyk: { state: 'found', captures: [{ url: 'https://snyk.example/report', capturedAt: OBSERVED_AT, screenshotPath: SCREENSHOTS[0] }], navigation: [nav['snyk-report']], warnings: [], findings: [], summary: { counts: { critical: 0, high: 0, medium: 0, low: 0 }, detail: { totalObserved: 0, retainedCount: 0, truncated: false, omittedCount: 0 } } },
      sonarqube: { state: 'found', captures: [{ url: 'https://sonar.example/dashboard?id=service-a', capturedAt: OBSERVED_AT, screenshotPath: SCREENSHOTS[1] }, { url: 'https://sonar.example/project/issues?id=service-a', capturedAt: OBSERVED_AT, screenshotPath: SCREENSHOTS[2] }], navigation: [nav['sonarqube-home'], nav['sonarqube-overall'], nav['sonarqube-issues']], warnings: [], facets: { types: [], severities: [] } },
    }, warnings: [],
  };
}

function completeManifest(runId: string, state: ProjectRunManifest['state'] = 'success', screenshots: readonly string[] = SCREENSHOTS): ProjectRunManifest {
  return {
    kind: 'project-run', schemaVersion: 3, project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: OBSERVED_AT }, state, jenkins: { jobUrl: JOB_URL },
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots }, warnings: [],
  };
}

function failureResult(runId: string): ProjectFailureResultV3 {
  return { schemaVersion: 3, project: { id: 'service-a', name: 'Service A' }, run: { runId, observedAt: OBSERVED_AT }, state: 'failed', diagnostic: 'capture failed', warnings: [] };
}

function failureManifest(runId: string, screenshots: readonly string[] = []): ProjectRunManifest {
  return {
    kind: 'project-run', schemaVersion: 3, project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: OBSERVED_AT }, state: 'failed',
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots }, warnings: [],
  };
}

function completeAggregate(runId: string): AggregateReportResult {
  return {
    schemaVersion: 3,
    generatedAt: OBSERVED_AT,
    warnings: [],
    projects: [{
      projectId: 'service-a',
      name: 'Service A',
      state: 'success',
      runId,
      reportPath: `service-a/${runId}/index.html`,
      runs: [{
        runId,
        state: 'success',
        jobId: 'job-id',
        branch: 'release/sit',
        manifestPath: `service-a/${runId}/manifest.json`,
        reportPath: `service-a/${runId}/index.html`,
        warnings: [],
      }],
      warnings: [],
    }],
  };
}

test('writes and discovers direct schema 3 project and aggregate reports', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-report-output-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date(OBSERVED_AT), '0000000000000011');
    const directory = await paths.allocateReport('service-a', runId);
    for (const filename of SCREENSHOTS) fs.writeFileSync(path.join(directory, filename), 'fixture');
    await writeProjectResult(directory, completeResult(runId), completeManifest(runId), paths.reportRoot);
    expect(fs.readFileSync(path.join(directory, 'index.html'), 'utf8')).toContain('../../assets/report.css');
    expect(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')).toContain('"schemaVersion": 3');

    const discovered = await discoverRunManifests(paths.reportRoot);
    expect(discovered.manifests).toHaveLength(1);
    expect(discovered.manifests[0]?.relativeDirectory).toBe(`service-a/${runId}`);
    const aggregate: AggregateReportResult = {
      schemaVersion: 3, generatedAt: OBSERVED_AT, warnings: [],
      projects: [{ projectId: 'service-a', name: 'Service A', state: 'success', runId, reportPath: `service-a/${runId}/index.html`, runs: [{ runId, state: 'success', manifestPath: `service-a/${runId}/manifest.json`, reportPath: `service-a/${runId}/index.html`, warnings: [] }], warnings: [] }],
    };
    await writeAggregateData(paths.reportRoot, aggregate);
    expect(fs.existsSync(path.join(paths.reportRoot, 'aggregate-data.json'))).toBe(true);
    expect(fs.readFileSync(path.join(paths.reportRoot, 'index.html'), 'utf8')).toContain(`service-a/${runId}/index.html`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('preserves existing aggregate publication when nested keys fail validation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregate-validation-'));
  const runId = createRunId(new Date(OBSERVED_AT), '0000000000000014');
  const aggregate = completeAggregate(runId);
  try {
    await writeAggregateData(root, aggregate);
    const published = JSON.parse(fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8')) as AggregateReportResult;
    expect(published.projects[0]?.runs[0]).toMatchObject({ jobId: 'job-id', branch: 'release/sit' });
    const previousData = fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8');
    const previousReport = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const projectSummary = aggregate.projects[0];
    if (projectSummary === undefined) throw new Error('aggregate fixture project was not created');
    const malformed = {
      ...aggregate,
      projects: [{
        ...projectSummary,
        runs: [{ ...projectSummary.runs[0]!, unexpected: true }],
      }],
    } as unknown as AggregateReportResult;
    await expect(writeAggregateData(root, malformed)).rejects.toThrow(/aggregate result schema/iu);
    expect(fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8')).toBe(previousData);
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toBe(previousReport);
    const overlong = {
      ...aggregate,
      projects: [{
        ...projectSummary,
        runs: [{ ...projectSummary.runs[0]!, jobId: 'x'.repeat(257) }],
      }],
    } as unknown as AggregateReportResult;
    await expect(writeAggregateData(root, overlong)).rejects.toThrow(/aggregate result schema/iu);
    expect(fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8')).toBe(previousData);
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toBe(previousReport);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
 
test('rejects aggregate paths that cross project identities', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregate-cross-link-'));
  const runId = createRunId(new Date(OBSERVED_AT), '0000000000000015');
  const aggregate = completeAggregate(runId);
  try {
    const projectSummary = aggregate.projects[0];
    if (projectSummary === undefined) throw new Error('aggregate fixture project was not created');
    const malformed = {
      ...aggregate,
      projects: [{
        ...projectSummary,
        runs: [{
          ...projectSummary.runs[0]!,
          manifestPath: `service-b/${runId}/manifest.json`,
        }],
      }],
    } as unknown as AggregateReportResult;
    expect(isValidAggregateResult(malformed)).toBe(false);
    await expect(writeAggregateData(root, malformed)).rejects.toThrow(/aggregate result schema/iu);
    expect(fs.existsSync(path.join(root, 'aggregate-data.json'))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects aggregate results over the global run budget', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregate-run-budget-'));
  const runsFor = (projectId: string) => Array.from({ length: 2_501 }, (_, index) => {
    const runId = `run-${index}`;
    return {
      runId,
      state: 'failed' as const,
      manifestPath: `${projectId}/${runId}/manifest.json`,
      warnings: [],
    };
  });
  const aggregate: AggregateReportResult = {
    schemaVersion: 3,
    generatedAt: OBSERVED_AT,
    projects: [
      { projectId: 'service-a', name: 'Service A', state: 'failed', runs: runsFor('service-a'), warnings: [] },
      { projectId: 'service-b', name: 'Service B', state: 'failed', runs: runsFor('service-b'), warnings: [] },
    ],
    warnings: [],
  };
  try {
    expect(isValidAggregateResult(aggregate)).toBe(false);
    await expect(writeAggregateData(root, aggregate)).rejects.toThrow(/aggregate result schema/iu);
    expect(fs.existsSync(path.join(root, 'aggregate-data.json'))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects aggregate timestamps outside strict ISO UTC format', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregate-timestamp-'));
  const malformed = { ...completeAggregate('run-timestamp'), generatedAt: '1' } as AggregateReportResult;
  try {
    expect(isValidAggregateResult(malformed)).toBe(false);
    await expect(writeAggregateData(root, malformed)).rejects.toThrow(/aggregate result schema/iu);
    expect(fs.existsSync(path.join(root, 'aggregate-data.json'))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('uses the shared manifest contract validator for persistence and discovery', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-validator-parity-'));
  const runId = 'run-parity';
  const directory = path.join(root, 'service-a', runId);
  const valid = completeManifest(runId);
  const malformed = { ...valid, unexpected: true } as unknown as ProjectRunManifest;
  try {
    expect(() => assertManifestContract(malformed)).toThrow(/manifest contract/iu);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(malformed));
    const discovered = await discoverRunManifests(root);
    expect(discovered.manifests).toHaveLength(0);
    expect(discovered.warnings).toContain('ignored invalid project run manifest');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persists direct failure output while removing unavailable and unsafe artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-failure-output-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date(OBSERVED_AT), '0000000000000012');
    const directory = await paths.allocateReport('service-a', runId);
    const manifest = failureManifest(runId, ['missing.png', '../outside.png', 'trace.zip'] as unknown as string[]);
    await writeFailureResult(directory, failureResult(runId), manifest, paths.reportRoot);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as ProjectRunManifest;
    expect(saved.schemaVersion).toBe(3);
    expect(saved.jenkins).toBeUndefined();
    expect(saved.artifacts.screenshots).toEqual([]);
    expect(saved.artifacts.trace).toBeUndefined();
    expect(saved.warnings.join(' ')).toMatch(/omitted (unavailable|unsafe)/u);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')).state).toBe('failed');
    expect(fs.existsSync(path.join(directory, 'index.html'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an over-budget direct failure before publishing a manifest', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-failure-budget-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date(OBSERVED_AT), '0000000000000013');
    const directory = await paths.allocateReport('service-a', runId);
    const screenshots = Array.from({ length: MAX_RUN_ARTIFACT_COUNT }, (_, index) => `failure-${index}.png`);
    for (const filename of screenshots) fs.writeFileSync(path.join(directory, filename), 'fixture');
    await expect(writeFailureResult(directory, failureResult(runId), failureManifest(runId, screenshots), paths.reportRoot)).rejects.toThrow(/manifest contract/iu);
    expect(fs.existsSync(path.join(directory, 'manifest.json'))).toBe(false);
    expect((await discoverRunManifests(paths.reportRoot)).manifests).toHaveLength(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bounds cumulative historical artifact discovery reads', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-artifact-discovery-budget-'));
  const runs = Math.ceil(MAX_DISCOVERY_ARTIFACT_BYTES / MAX_SINGLE_ARTIFACT_BYTES) + 1;
  try {
    for (let index = 0; index < runs; index += 1) {
      const runId = `run-${index}`;
      const directory = path.join(root, 'service-a', runId);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(failureManifest(runId, ['shot.png'])));
      fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify(failureResult(runId)));
      const screenshot = path.join(directory, 'shot.png');
      fs.writeFileSync(screenshot, '');
      fs.truncateSync(screenshot, MAX_SINGLE_ARTIFACT_BYTES);
    }
    const discovered = await discoverRunManifests(root);
    expect(discovered.warnings).toContain('historical artifact discovery budget reached');
    expect(discovered.manifests.length).toBeLessThan(runs);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
