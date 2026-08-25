import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { discoverRunManifests } from '../../src/artifacts/aggregate-manifest-reader.js';
import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import { writeAggregateData, writeFailureResult, writeProjectResult } from '../../src/artifacts/result-writer.js';
import type { ProjectFailureResultV2, ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import type { AggregateReportResult, VulnerabilityReportResultV2 } from '../../src/result-types.js';

function completeResult(runId: string, buildNumber: number): VulnerabilityReportResultV2 {
  const buildUrl = `https://jenkins.example/job/service-a/${buildNumber}/`;
  const target = (key: 'jenkins-build' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues', localAnchor: string) => ({ key, localAnchor, state: 'found' as const });
  const capture = (url: string, screenshotPath?: string) => ({ url, capturedAt: '2026-08-24T04:00:00.000Z', ...(screenshotPath === undefined ? {} : { screenshotPath }) });
  return {
    schemaVersion: 2, state: 'success', project: { id: 'service-a', name: 'Service A' }, run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
    jenkins: { baseUrl: 'https://jenkins.example', jobPath: 'service-a', jobUrl: 'https://jenkins.example/job/service-a/', buildNumber, buildUrl, status: 'SUCCESS', trigger: { capability: 'existing_build', triggerAttempts: 0, warnings: [] } },
    navigation: {
      'jenkins-build': target('jenkins-build', '#jenkins'), 'snyk-report': target('snyk-report', '#snyk-test-report'), 'sonarqube-home': target('sonarqube-home', '#sonarqube-home'), 'sonarqube-overall': target('sonarqube-overall', '#sonarqube-overall'), 'sonarqube-issues': target('sonarqube-issues', '#sonarqube-issues'),
    },
    reports: {
      snyk: { state: 'found', captures: [capture('https://snyk.example/report', 'snyk-test-report.png')], navigation: [target('snyk-report', '#snyk-test-report')], warnings: [], findings: [], summary: { counts: { critical: 0, high: 0, medium: 0, low: 0 }, detail: { totalObserved: 0, retainedCount: 0, truncated: false, omittedCount: 0 } } },
      sonarqube: { state: 'found', captures: [capture('https://sonar.example/dashboard?id=service-a&codeScope=overall', 'sonarqube-overall.png'), capture('https://sonar.example/project/issues?id=service-a', 'sonarqube-issues.png')], navigation: [target('sonarqube-home', '#sonarqube-home'), target('sonarqube-overall', '#sonarqube-overall'), target('sonarqube-issues', '#sonarqube-issues')], warnings: [], facets: { types: [], severities: [] } },
    }, warnings: [],
  };
}

function completeManifest(runId: string, buildNumber: number): ProjectRunManifest {
  return { kind: 'project-run', schemaVersion: 2, project: { id: 'service-a', name: 'Service A' }, run: { runId, observedAt: '2026-08-24T04:00:00.000Z' }, state: 'success', jenkins: { buildNumber, buildUrl: `https://jenkins.example/job/service-a/${buildNumber}/` }, artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: ['snyk-test-report.png', 'sonarqube-overall.png', 'sonarqube-issues.png'] }, warnings: [] };
}

function failureResult(runId: string, buildNumber: number): ProjectFailureResultV2 {
  return {
    schemaVersion: 2,
    project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: '2026-08-24T04:00:00.000Z' },
    state: 'failed',
    jenkins: { buildNumber, buildUrl: `https://jenkins.example/job/service-a/${buildNumber}/` },
    diagnostic: 'capture failed',
    warnings: [],
  };
}

test('writes project HTML, shared CSS, JSON, and aggregate HTML atomically', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-report-output-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000011');
    const directory = await paths.allocateReport('service-a', 42, runId);
    for (const filename of ['snyk-test-report.png', 'sonarqube-overall.png', 'sonarqube-issues.png']) fs.writeFileSync(path.join(directory, filename), 'fixture');
    await writeProjectResult(directory, completeResult(runId, 42), completeManifest(runId, 42), paths.reportRoot);
    expect(fs.existsSync(path.join(directory, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(paths.reportRoot, 'assets', 'report.css'))).toBe(true);
    expect(fs.readFileSync(path.join(directory, 'index.html'), 'utf8')).toContain('../../../assets/report.css');
    expect(fs.readFileSync(path.join(directory, 'index.html'), 'utf8')).not.toMatch(/<script/iu);

    const discovered = await discoverRunManifests(paths.reportRoot);
    expect(discovered.manifests[0]?.reportPath).toBe('service-a/42/' + runId + '/index.html');
    const aggregate: AggregateReportResult = { schemaVersion: 2, generatedAt: '2026-08-24T04:00:00.000Z', warnings: [], projects: [{ projectId: 'service-a', name: 'Service A', state: 'success', reportPath: `service-a/42/${runId}/index.html`, runs: [{ buildNumber: 42, runId, state: 'success', manifestPath: `service-a/42/${runId}/manifest.json`, reportPath: `service-a/42/${runId}/index.html`, warnings: [] }], warnings: [] }] };
    await writeAggregateData(paths.reportRoot, aggregate);
    expect(fs.readFileSync(path.join(paths.reportRoot, 'index.html'), 'utf8')).toContain(`service-a/42/${runId}/index.html`);
    expect(fs.existsSync(path.join(paths.reportRoot, 'aggregate-data.json'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('publishes a failed marker after report rendering fails without leaving a success marker', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-report-publication-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const outside = path.join(root, 'outside-assets');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(paths.reportRoot, 'assets'), 'dir');
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000012');
    const directory = await paths.allocateReport('service-a', 42, runId);
    const successManifest = { ...completeManifest(runId, 42), artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: [] } };

    await expect(writeProjectResult(directory, completeResult(runId, 42), successManifest, paths.reportRoot)).rejects.toThrow(/unsafe/u);
    expect(fs.existsSync(path.join(directory, 'data.json'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'manifest.json'))).toBe(false);

    const failedManifest = { ...successManifest, state: 'failed' as const, warnings: [] };
    await writeFailureResult(directory, failureResult(runId, 42), failedManifest, paths.reportRoot);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')).state).toBe('failed');
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')).state).toBe('failed');
    expect(fs.existsSync(path.join(directory, 'index.html'))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('restores existing failure files when reused-directory publication fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-report-failure-rollback-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:03.000Z'), '0000000000000019');
    const directory = await paths.allocateReport('service-a', 42, runId);
    const previous = {
      'data.json': Buffer.from('{"state":"previous"}\n'),
      'index.html': Buffer.from('<html>previous</html>\n'),
      'manifest.json': Buffer.from('{"state":"previous"}\n'),
    };
    for (const [filename, contents] of Object.entries(previous)) fs.writeFileSync(path.join(directory, filename), contents);
    const screenshots = Array.from({ length: 16 }, (_, index) => `rollback-${index}.png`);
    for (const filename of screenshots) fs.writeFileSync(path.join(directory, filename), 'fixture');
    const manifest = {
      ...completeManifest(runId, 42),
      state: 'failed' as const,
      artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots },
    };

    await expect(writeFailureResult(directory, failureResult(runId, 42), manifest, paths.reportRoot)).rejects.toThrow(/artifact count/u);
    for (const [filename, contents] of Object.entries(previous)) {
      expect(fs.readFileSync(path.join(directory, filename))).toEqual(contents);
    }
    expect(fs.readdirSync(path.dirname(directory)).filter((filename) => filename.startsWith('.failure-rollback-'))).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rolls back staged success output when the final manifest marker cannot be published', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-report-rollback-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000014');
    const directory = await paths.allocateReport('service-a', 42, runId);
    const successManifest = { ...completeManifest(runId, 42), artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: [] } };
    fs.writeFileSync(path.join(directory, 'manifest.json'), '{"state":"pre-existing"}\n');

    await expect(writeProjectResult(directory, completeResult(runId, 42), successManifest, paths.reportRoot)).rejects.toThrow();
    expect(fs.existsSync(path.join(directory, 'index.html'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'data.json'))).toBe(false);
    expect(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')).toContain('pre-existing');

    const secondRunId = createRunId(new Date('2026-08-24T04:00:01.000Z'), '0000000000000016');
    const secondDirectory = await paths.allocateReport('service-a', 42, secondRunId);
    const secondManifest = { ...completeManifest(secondRunId, 42), artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: [] } };
    fs.writeFileSync(path.join(secondDirectory, 'data.json'), '{"state":"pre-existing"}\n');
    await expect(writeProjectResult(secondDirectory, completeResult(secondRunId, 42), secondManifest, paths.reportRoot)).rejects.toThrow();
    expect(fs.existsSync(path.join(secondDirectory, 'index.html'))).toBe(false);
    expect(fs.readFileSync(path.join(secondDirectory, 'data.json'), 'utf8')).toContain('pre-existing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persists failure output while removing missing artifact references', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-report-failure-artifact-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000015');
    const directory = await paths.allocateReport('service-a', 42, runId);
    const failedManifest = {
      ...completeManifest(runId, 42),
      state: 'failed' as const,
      artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots: ['missing.png'], trace: 'trace.zip' as const },
    };

    await writeFailureResult(directory, failureResult(runId, 42), failedManifest, paths.reportRoot);
    const savedManifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as ProjectRunManifest;
    expect(savedManifest.state).toBe('failed');
    expect(savedManifest.artifacts.screenshots).toEqual([]);
    expect(savedManifest.artifacts.trace).toBeUndefined();
    expect(savedManifest.warnings.join(' ')).toMatch(/omitted unavailable (screenshot|trace) artifact/u);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')).state).toBe('failed');
    expect(fs.readFileSync(path.join(directory, 'index.html'), 'utf8')).not.toContain('href="missing.png"');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persists failure output while removing unsafe screenshot and trace references', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-report-unsafe-artifact-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000017');
    const directory = await paths.allocateReport('service-a', 42, runId);
    const unsafeManifest = {
      ...completeManifest(runId, 42),
      state: 'failed' as const,
      artifacts: {
        manifest: 'manifest.json' as const,
        data: 'data.json' as const,
        screenshots: ['../outside.png'] as unknown as string[],
        trace: '../outside-trace.zip' as unknown as 'trace.zip',
      },
    };

    await writeFailureResult(directory, failureResult(runId, 42), unsafeManifest, paths.reportRoot);
    const savedManifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as ProjectRunManifest;
    expect(savedManifest.artifacts.screenshots).toEqual([]);
    expect(savedManifest.artifacts.trace).toBeUndefined();
    expect(savedManifest.warnings.join(' ')).toMatch(/unsafe (screenshot|trace) artifact reference/u);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')).state).toBe('failed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects over-budget failure fallbacks before publishing a manifest', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-report-failure-budget-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const cases = [
      { suffix: 'sixteen', screenshotCount: 16, trace: false },
      { suffix: 'fifteen-plus-trace', screenshotCount: 15, trace: true },
    ] as const;

    for (const [index, scenario] of cases.entries()) {
      const runId = createRunId(new Date(`2026-08-24T04:00:0${index}.000Z`), `000000000000002${index}`);
      const directory = await paths.allocateReport('service-a', 42, runId);
      const screenshots = Array.from({ length: scenario.screenshotCount }, (_, screenshotIndex) => `failure-${scenario.suffix}-${screenshotIndex}.png`);
      for (const filename of screenshots) fs.writeFileSync(path.join(directory, filename), 'fixture');
      if (scenario.trace) fs.writeFileSync(path.join(directory, 'trace.zip'), 'trace-fixture');
      const manifest = {
        ...completeManifest(runId, 42),
        state: 'failed' as const,
        artifacts: {
          manifest: 'manifest.json' as const,
          data: 'data.json' as const,
          screenshots,
          ...(scenario.trace ? { trace: 'trace.zip' as const } : {}),
        },
      };

      await expect(writeFailureResult(directory, failureResult(runId, 42), manifest, paths.reportRoot)).rejects.toThrow(/artifact count/u);
      expect(fs.existsSync(path.join(directory, 'data.json'))).toBe(false);
      expect(fs.existsSync(path.join(directory, 'index.html'))).toBe(false);
      expect(fs.existsSync(path.join(directory, 'manifest.json'))).toBe(false);
      expect(fs.readdirSync(directory).filter((filename) => filename.startsWith('.tmp'))).toEqual([]);
    }
    expect((await discoverRunManifests(paths.reportRoot)).manifests).toHaveLength(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps the fifteen-screenshot failure boundary discoverable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-report-failure-boundary-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:02.000Z'), '0000000000000022');
    const directory = await paths.allocateReport('service-a', 42, runId);
    const screenshots = Array.from({ length: 15 }, (_, index) => `failure-boundary-${index}.png`);
    for (const filename of screenshots) fs.writeFileSync(path.join(directory, filename), 'fixture');
    const manifest = {
      ...completeManifest(runId, 42),
      state: 'failed' as const,
      artifacts: { manifest: 'manifest.json' as const, data: 'data.json' as const, screenshots },
    };

    await writeFailureResult(directory, failureResult(runId, 42), manifest, paths.reportRoot);
    const discovery = await discoverRunManifests(paths.reportRoot);
    expect(discovery.manifests).toHaveLength(1);
    expect(discovery.manifests[0]?.manifest.artifacts.screenshots).toHaveLength(15);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a malformed manifest before publishing the failure marker', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-report-manifest-contract-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000018');
    const directory = await paths.allocateReport('service-a', 42, runId);
    const malformedManifest = { ...completeManifest(runId, 42), state: 'failed' as const, kind: 'not-a-project-run' as 'project-run' };

    await expect(writeFailureResult(directory, failureResult(runId, 42), malformedManifest, paths.reportRoot)).rejects.toThrow(/manifest contract/u);
    expect(fs.existsSync(path.join(directory, 'data.json'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'manifest.json'))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('renders only the sanitized manifest when warnings contain credential-like text', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-report-redaction-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const runId = createRunId(new Date('2026-08-24T04:00:00.000Z'), '0000000000000013');
    const directory = await paths.allocateReport('service-a', 42, runId);
    for (const filename of ['snyk-test-report.png', 'sonarqube-overall.png', 'sonarqube-issues.png']) fs.writeFileSync(path.join(directory, filename), 'fixture');
    const unsafeManifest = { ...completeManifest(runId, 42), warnings: ['password=super-secret'] };

    await writeProjectResult(directory, completeResult(runId, 42), unsafeManifest, paths.reportRoot);
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
    expect(html).not.toContain('super-secret');
    expect(html).toContain('[REDACTED]');
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')).warnings).toEqual(['password=[REDACTED]']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps the previous aggregate JSON and HTML pair when rendering the replacement fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-aggregate-rollback-'));
  try {
    const paths = new ArtifactPaths(path.join(root, 'reports'));
    await paths.initialize();
    const aggregate: AggregateReportResult = {
      schemaVersion: 2,
      generatedAt: '2026-08-24T04:00:00.000Z',
      warnings: [],
      projects: [{
        projectId: 'service-a', name: 'Service A', state: 'success',
        runs: [{ buildNumber: 42, runId: 'run-a', state: 'success', manifestPath: 'service-a/42/run-a/manifest.json', warnings: [] }],
        warnings: [],
      }],
    };
    await writeAggregateData(paths.reportRoot, aggregate);
    const oldData = fs.readFileSync(path.join(paths.reportRoot, 'aggregate-data.json'), 'utf8');
    const oldReport = fs.readFileSync(path.join(paths.reportRoot, 'index.html'), 'utf8');
    fs.rmSync(path.join(paths.reportRoot, 'assets'), { recursive: true, force: true });
    const outside = path.join(root, 'outside-assets');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(paths.reportRoot, 'assets'), 'dir');

    await expect(writeAggregateData(paths.reportRoot, { ...aggregate, warnings: ['replacement'] })).rejects.toThrow(/unsafe/u);
    expect(fs.readFileSync(path.join(paths.reportRoot, 'aggregate-data.json'), 'utf8')).toBe(oldData);
    expect(fs.readFileSync(path.join(paths.reportRoot, 'index.html'), 'utf8')).toBe(oldReport);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
