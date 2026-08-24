import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { ArtifactPaths, createRunId } from '../../src/artifacts/artifact-paths.js';
import type { ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import { writeFailureManifest, writeProjectResult } from '../../src/artifacts/result-writer.js';
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
