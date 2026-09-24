import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { loadProjectConfig } from '../../src/config.js';
import { runConfiguredProjects } from '../../src/runner.js';

import { discoverRunManifests } from '../../src/artifacts/aggregate-manifest-reader.js';
import { writeAggregateDataPair } from '../../src/artifacts/aggregate-report-publisher.js';
import {
  isValidAggregateResult,
  MAX_AGGREGATE_PROJECTS,
} from '../../src/artifacts/result-validation.js';
import { MAX_STATIC_FILE_BYTES } from '../../src/reporting/report-server-constants.js';
import type { AggregateReportResult } from '../../src/result-types.js';
function failureResult(runId: string) {
  return {
    schemaVersion: 3,
    project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: '2026-09-24T12:00:00.000Z' },
    state: 'failed' as const,
    diagnostic: 'capture failed',
    warnings: [],
  };
}

function failureManifest(runId: string) {
  return {
    kind: 'project-run' as const,
    schemaVersion: 3 as const,
    project: { id: 'service-a', name: 'Service A' },
    run: { runId, observedAt: '2026-09-24T12:00:00.000Z' },
    state: 'failed' as const,
    artifacts: {
      manifest: 'manifest.json' as const,
      data: 'data.json' as const,
      screenshots: [],
    },
    warnings: [],
  };
}

test.describe('Persistent aggregate validation and boundary limits', () => {
  test('isValidAggregateResult accepts zero-project aggregate and 81-character project ID', () => {
    const emptyAggregate: AggregateReportResult = {
      schemaVersion: 3,
      generatedAt: '2026-09-24T12:00:00.000Z',
      projects: [],
      warnings: [],
    };
    expect(isValidAggregateResult(emptyAggregate)).toBe(true);

    // 81-character project ID matching SAFE_ID: 1 char + 80 chars
    const maxSafeId = 'a' + 'b'.repeat(80);
    expect(maxSafeId).toHaveLength(81);

    const aggregateWithMaxId: AggregateReportResult = {
      schemaVersion: 3,
      generatedAt: '2026-09-24T12:00:00.000Z',
      projects: [
        {
          projectId: maxSafeId,
          name: 'Max ID Project',
          state: 'success',
          runs: [],
          warnings: [],
        },
      ],
      warnings: [],
    };
    expect(isValidAggregateResult(aggregateWithMaxId)).toBe(true);

    // 82-character project ID should be rejected
    const overlongId = 'a' + 'b'.repeat(81);
    expect(isValidAggregateResult({
      ...aggregateWithMaxId,
      projects: [{ ...aggregateWithMaxId.projects[0]!, projectId: overlongId }],
    })).toBe(false);
  });

  test('isValidAggregateResult enforces MAX_AGGREGATE_PROJECTS ceiling', () => {
    expect(MAX_AGGREGATE_PROJECTS).toBe(5_050);

    const makeProjects = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        projectId: `proj-${i}`,
        name: `Project ${i}`,
        state: 'success' as const,
        runs: [],
        warnings: [],
      }));

    const validAtCeiling: AggregateReportResult = {
      schemaVersion: 3,
      generatedAt: '2026-09-24T12:00:00.000Z',
      projects: makeProjects(MAX_AGGREGATE_PROJECTS),
      warnings: [],
    };
    expect(isValidAggregateResult(validAtCeiling)).toBe(true);

    const invalidAboveCeiling: AggregateReportResult = {
      schemaVersion: 3,
      generatedAt: '2026-09-24T12:00:00.000Z',
      projects: makeProjects(MAX_AGGREGATE_PROJECTS + 1),
      warnings: [],
    };
    expect(isValidAggregateResult(invalidAboveCeiling)).toBe(false);
  });

  test('discoverRunManifests flags incomplete when manifest maximum is reached', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-incomplete-'));
    try {
      for (let i = 1; i <= 3; i++) {
        const dir = path.join(root, 'service-a', `run-${i}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(failureManifest(`run-${i}`)));
        fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(failureResult(`run-${i}`)));
      }

      // Asking for maximum 2 when 3 exist
      const result = await discoverRunManifests(root, 2);
      expect(result.incomplete).toBe(true);
      expect(result.warnings).toContain('manifest discovery limit reached');
      expect(result.manifests.length).toBeLessThanOrEqual(2);

      // Asking for maximum 10 when 3 exist
      const completeResult = await discoverRunManifests(root, 10);
      expect(completeResult.incomplete).toBe(false);
      expect(completeResult.manifests).toHaveLength(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('writeAggregateDataPair rejects output exceeding MAX_STATIC_FILE_BYTES and preserves prior files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-size-limit-'));
    try {
      const initialAggregate: AggregateReportResult = {
        schemaVersion: 3,
        generatedAt: '2026-09-24T12:00:00.000Z',
        projects: [
          {
            projectId: 'service-a',
            name: 'Service A',
            state: 'success',
            runs: [],
            warnings: [],
          },
        ],
        warnings: [],
      };

      await writeAggregateDataPair(root, initialAggregate);
      const initialData = fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8');
      const initialReport = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

      const maxWarnings = Array.from({ length: 30 }, () => 'w'.repeat(500));
      const oversizedRuns = Array.from({ length: 1200 }, (_, i) => ({
        runId: `run-${i}`,
        state: 'success' as const,
        manifestPath: `service-a/run-${i}/manifest.json`,
        warnings: maxWarnings,
      }));

      const oversizedAggregate: AggregateReportResult = {
        schemaVersion: 3,
        generatedAt: '2026-09-24T12:00:00.000Z',
        projects: [
          {
            projectId: 'service-a',
            name: 'Service A',
            state: 'success',
            runs: oversizedRuns,
            warnings: [],
          },
        ],
        warnings: [],
      };
      expect(isValidAggregateResult(oversizedAggregate)).toBe(true);

      await expect(writeAggregateDataPair(root, oversizedAggregate)).rejects.toThrow(
        /aggregate data exceeds maximum static file size/i
      );

      // Previous files are preserved intact
      expect(fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8')).toBe(initialData);
      expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toBe(initialReport);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('runner persists historical projects in aggregate-data.json and index.html across distinct configuration runs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-persist-'));
    try {
      const environment = { A_USER: 'u-a', A_PASS: 'p-a', B_USER: 'u-b', B_PASS: 'p-b' };
      const configFile = path.join(root, 'projects.json');
      fs.writeFileSync(configFile, JSON.stringify({
        schemaVersion: 1,
        defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 5000 },
        projects: [
          { id: 'proj-a', name: 'Project A', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/proj-a/', credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASS' } },
          { id: 'proj-b', name: 'Project B', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/proj-b/', credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASS' } },
        ],
      }), { mode: 0o600 });
      const allProjects = loadProjectConfig(configFile, environment);
      const configA = allProjects[0]!;
      const configB = allProjects[1]!;

      const fakeBrowser = {
        newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
        close: async () => undefined,
      } as unknown as Browser;

      await runConfiguredProjects([configA], {
        launchBrowser: async () => fakeBrowser,
        executeProject: async (project) => {
          const dir = path.join(root, 'reports', project.id, 'run-1');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
            kind: 'project-run',
            schemaVersion: 3,
            project: { id: 'proj-a', name: 'Project A' },
            run: { runId: 'run-1', observedAt: '2026-09-24T10:00:00.000Z' },
            state: 'failed',
            artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
            warnings: [],
          }));
          fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({
            schemaVersion: 3,
            project: { id: 'proj-a', name: 'Project A' },
            run: { runId: 'run-1', observedAt: '2026-09-24T10:00:00.000Z' },
            state: 'failed',
            diagnostic: 'a failed',
            warnings: [],
          }));
          return {
            projectId: project.id,
            name: project.name,
            state: 'failed',
            runId: 'run-1',
            warnings: [],
          };
        },
      });

      const firstData = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'aggregate-data.json'), 'utf8')) as AggregateReportResult;
      expect(firstData.projects.map((p) => p.projectId)).toEqual(['proj-a']);

      await runConfiguredProjects([configB], {
        launchBrowser: async () => fakeBrowser,
        executeProject: async (project) => {
          const dir = path.join(root, 'reports', project.id, 'run-2');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
            kind: 'project-run',
            schemaVersion: 3,
            project: { id: 'proj-b', name: 'Project B' },
            run: { runId: 'run-2', observedAt: '2026-09-24T11:00:00.000Z' },
            state: 'failed',
            artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
            warnings: [],
          }));
          fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({
            schemaVersion: 3,
            project: { id: 'proj-b', name: 'Project B' },
            run: { runId: 'run-2', observedAt: '2026-09-24T11:00:00.000Z' },
            state: 'failed',
            diagnostic: 'b failed',
            warnings: [],
          }));
          return {
            projectId: project.id,
            name: project.name,
            state: 'failed',
            runId: 'run-2',
            warnings: [],
          };
        },
      });

      const secondData = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'aggregate-data.json'), 'utf8')) as AggregateReportResult;
      expect(secondData.projects.map((p) => p.projectId)).toEqual(['proj-b', 'proj-a']);

      const secondReport = fs.readFileSync(path.join(root, 'reports', 'index.html'), 'utf8');
      expect(secondReport).toContain('2 retained project(s)');
      expect(secondReport).toContain('Project B');
      expect(secondReport).toContain('Project A');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
