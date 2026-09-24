import { expect, test } from '@playwright/test';

import type { DiscoveredRunManifest, ManifestDiscoveryResult, ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import type { ProjectOutcome } from '../../src/project/project-types.js';
import { buildAggregateIndex } from '../../src/artifacts/aggregate-index-builder.js';
import { isValidAggregateResult } from '../../src/artifacts/result-validation.js';

function fakeDiscoveredManifest(options: {
  projectId: string;
  projectName?: string;
  runId: string;
  observedAt: string;
  state?: 'success' | 'partial' | 'failed';
  jobUrl?: string;
  hasReport?: boolean;
  warnings?: string[];
}): DiscoveredRunManifest {
  const {
    projectId,
    projectName = `Project ${projectId}`,
    runId,
    observedAt,
    state = 'success',
    jobUrl = `https://jenkins.example/job/${projectId}/job/main/`,
    hasReport = true,
    warnings = [],
  } = options;

  const manifest: ProjectRunManifest = {
    kind: 'project-run',
    schemaVersion: 3,
    project: { id: projectId, name: projectName },
    run: { runId, observedAt },
    state,
    jenkins: { jobUrl },
    artifacts: {
      manifest: 'manifest.json',
      data: 'data.json',
      screenshots: [],
    },
    warnings,
  };

  return {
    manifest,
    relativeDirectory: `${projectId}/${runId}`,
    manifestPath: `${projectId}/${runId}/manifest.json`,
    ...(hasReport ? { reportPath: `${projectId}/${runId}/index.html` } : {}),
  };
}

test.describe('buildAggregateIndex', () => {
  test('returns valid empty aggregate when no manifests and no outcomes exist', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [],
      warnings: [],
      ignoredIncompatibleCount: 0,
      incomplete: false,
    };

    const result = buildAggregateIndex({
      discovery,
      generatedAt: '2026-09-24T12:00:00.000Z',
    });

    expect(isValidAggregateResult(result)).toBe(true);
    expect(result.projects).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.schemaVersion).toBe(3);
    expect(result.generatedAt).toBe('2026-09-24T12:00:00.000Z');
  });

  test('throws error if manifest discovery is marked incomplete', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-1',
          observedAt: '2026-09-24T10:00:00.000Z',
        }),
      ],
      warnings: ['manifest discovery limit reached'],
      ignoredIncompatibleCount: 0,
      incomplete: true,
    };

    expect(() =>
      buildAggregateIndex({ discovery })
    ).toThrow(/cannot build aggregate index from incomplete manifest discovery/i);
  });

  test('retains historical-only projects not in active outcomes, sorted alphabetically', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [
        fakeDiscoveredManifest({
          projectId: 'zebra-service',
          runId: 'run-z1',
          observedAt: '2026-09-24T10:00:00.000Z',
        }),
        fakeDiscoveredManifest({
          projectId: 'alpha-service',
          runId: 'run-a1',
          observedAt: '2026-09-24T10:00:00.000Z',
        }),
      ],
      warnings: [],
      ignoredIncompatibleCount: 0,
      incomplete: false,
    };

    const result = buildAggregateIndex({
      discovery,
      generatedAt: '2026-09-24T12:00:00.000Z',
    });

    expect(isValidAggregateResult(result)).toBe(true);
    expect(result.projects.map((p) => p.projectId)).toEqual(['alpha-service', 'zebra-service']);
    expect(result.projects[0]?.name).toBe('Project alpha-service');
    expect(result.projects[0]?.runId).toBe('run-a1');
    expect(result.projects[0]?.reportPath).toBe('alpha-service/run-a1/index.html');
  });

  test('orders project runs latest-first by observedAt and breaks ties by runId', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-older',
          observedAt: '2026-09-24T08:00:00.000Z',
        }),
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-tie-1',
          observedAt: '2026-09-24T10:00:00.000Z',
        }),
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-tie-2',
          observedAt: '2026-09-24T10:00:00.000Z',
        }),
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-newest',
          observedAt: '2026-09-24T11:00:00.000Z',
        }),
      ],
      warnings: [],
      ignoredIncompatibleCount: 0,
      incomplete: false,
    };

    const result = buildAggregateIndex({
      discovery,
      generatedAt: '2026-09-24T12:00:00.000Z',
    });

    const project = result.projects[0]!;
    expect(project.projectId).toBe('service-a');
    expect(project.runId).toBe('run-newest');
    expect(project.runs.map((r) => r.runId)).toEqual([
      'run-newest',
      'run-tie-2',
      'run-tie-1',
      'run-older',
    ]);
  });

  test('omits reportPath on project if latest run has no report file', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-old',
          observedAt: '2026-09-24T08:00:00.000Z',
          hasReport: true,
        }),
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-latest-failed',
          observedAt: '2026-09-24T10:00:00.000Z',
          state: 'failed',
          hasReport: false,
        }),
      ],
      warnings: [],
      ignoredIncompatibleCount: 0,
      incomplete: false,
    };

    const result = buildAggregateIndex({
      discovery,
      generatedAt: '2026-09-24T12:00:00.000Z',
    });

    const project = result.projects[0]!;
    expect(project.runId).toBe('run-latest-failed');
    expect(project.reportPath).toBeUndefined();
    expect(project.runs[0]?.reportPath).toBeUndefined();
    expect(project.runs[1]?.reportPath).toBe('service-a/run-old/index.html');
  });

  test('active outcomes take precedence over historical metadata and determine project order', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [
        fakeDiscoveredManifest({
          projectId: 'project-historical',
          runId: 'hist-1',
          observedAt: '2026-09-24T08:00:00.000Z',
        }),
        fakeDiscoveredManifest({
          projectId: 'project-b',
          runId: 'run-b1',
          observedAt: '2026-09-24T09:00:00.000Z',
        }),
        fakeDiscoveredManifest({
          projectId: 'project-a',
          runId: 'run-a1',
          observedAt: '2026-09-24T09:00:00.000Z',
        }),
      ],
      warnings: [],
      ignoredIncompatibleCount: 0,
      incomplete: false,
    };

    const outcomes: ProjectOutcome[] = [
      {
        projectId: 'project-b',
        name: 'Active Project B Name',
        state: 'success',
        runId: 'run-b1',
        warnings: ['active-b-warning'],
      },
      {
        projectId: 'project-a',
        name: 'Active Project A Name',
        state: 'partial',
        runId: 'run-a1',
        warnings: [],
      },
    ];

    const result = buildAggregateIndex({
      discovery,
      outcomes,
      generatedAt: '2026-09-24T12:00:00.000Z',
    });

    expect(isValidAggregateResult(result)).toBe(true);
    // Project order: active outcomes first in order, then historical-only projects alphabetically
    expect(result.projects.map((p) => p.projectId)).toEqual([
      'project-b',
      'project-a',
      'project-historical',
    ]);

    expect(result.projects[0]?.name).toBe('Active Project B Name');
    expect(result.projects[0]?.warnings).toEqual(['active-b-warning']);
    expect(result.projects[1]?.state).toBe('partial');
    expect(result.projects[2]?.name).toBe('Project project-historical');
  });

  test('handles active failure without validated manifest (ephemeral row, no fake links)', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'old-run',
          observedAt: '2026-09-24T08:00:00.000Z',
        }),
      ],
      warnings: [],
      ignoredIncompatibleCount: 0,
      incomplete: false,
    };

    const outcomes: ProjectOutcome[] = [
      {
        projectId: 'service-a',
        name: 'Service A',
        state: 'failed',
        runId: 'new-unvalidated-run',
        error: 'Connection timeout',
        warnings: ['warn-1'],
      },
      {
        projectId: 'service-brand-new',
        name: 'Brand New Service',
        state: 'failed',
        runId: 'brand-new-run',
        error: 'Setup failure',
        warnings: [],
      },
    ];

    const result = buildAggregateIndex({
      discovery,
      outcomes,
      generatedAt: '2026-09-24T12:00:00.000Z',
    });

    expect(isValidAggregateResult(result)).toBe(true);
    const serviceA = result.projects.find((p) => p.projectId === 'service-a')!;
    expect(serviceA.state).toBe('failed');
    expect(serviceA.runId).toBe('new-unvalidated-run');
    expect(serviceA.reportPath).toBeUndefined(); // No reportPath fabricated!
    expect(serviceA.warnings).toEqual(['warn-1', 'Connection timeout']);
    expect(serviceA.runs.map((r) => r.runId)).toEqual(['old-run']);

    const brandNew = result.projects.find((p) => p.projectId === 'service-brand-new')!;
    expect(brandNew.state).toBe('failed');
    expect(brandNew.runId).toBe('brand-new-run');
    expect(brandNew.reportPath).toBeUndefined();
    expect(brandNew.runs).toEqual([]);
    expect(brandNew.warnings).toEqual(['Setup failure']);
  });

  test('extracts Jenkins jobId and branch and sanitizes persisted warnings', () => {
    const discovery: ManifestDiscoveryResult = {
      manifests: [
        fakeDiscoveredManifest({
          projectId: 'service-a',
          runId: 'run-1',
          observedAt: '2026-09-24T10:00:00.000Z',
          jobUrl: 'https://jenkins.example/job/folder/job/org/job/repo/job/feature%2Ftest/',
          warnings: ['secret password=123 in log', 'x'.repeat(600)],
        }),
      ],
      warnings: ['initial diagnostic warning'],
      ignoredIncompatibleCount: 0,
      incomplete: false,
    };

    const result = buildAggregateIndex({
      discovery,
      warnings: ['caller warning'],
      generatedAt: '2026-09-24T12:00:00.000Z',
    });

    expect(isValidAggregateResult(result)).toBe(true);
    const run = result.projects[0]!.runs[0]!;
    expect(run.jobId).toBe('repo');
    expect(run.branch).toBe('feature/test');
    expect(run.warnings[0]).not.toContain('123');
    expect(run.warnings[1]?.length).toBeLessThanOrEqual(500);
    expect(result.warnings).toContain('caller warning');
    expect(result.warnings).toContain('initial diagnostic warning');
  });
});
