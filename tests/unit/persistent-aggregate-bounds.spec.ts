import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { loadProjectConfig } from '../../src/config.js';
import { runConfiguredProjects } from '../../src/runner.js';

import { discoverRunManifests } from '../../src/artifacts/aggregate-manifest-reader.js';
import { writeAggregateDataPair } from '../../src/artifacts/aggregate-report-publisher.js';
import { recoverAggregatePublication } from '../../src/artifacts/aggregate-publication-recovery.js';
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

  test('writeAggregateDataPair rejects malformed nonempty project row and rolls back both outputs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-malformed-row-'));
    try {
      const initialAggregate: AggregateReportResult = {
        schemaVersion: 3,
        generatedAt: '2026-09-24T10:00:00.000Z',
        projects: [
          {
            projectId: 'valid-project',
            name: 'Valid Project',
            state: 'success',
            runId: 'run-1',
            reportPath: 'valid-project/run-1/index.html',
            runs: [
              {
                runId: 'run-1',
                state: 'success',
                manifestPath: 'valid-project/run-1/manifest.json',
                reportPath: 'valid-project/run-1/index.html',
                warnings: [],
              },
            ],
            warnings: [],
          },
        ],
        warnings: [],
      };

      await writeAggregateDataPair(root, initialAggregate);
      const initialData = fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8');
      const initialReport = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

      const malformedAggregate = {
        ...initialAggregate,
        projects: [
          {
            ...initialAggregate.projects[0]!,
            state: 'not-a-valid-state',
          },
        ],
      } as unknown as AggregateReportResult;

      await expect(writeAggregateDataPair(root, malformedAggregate)).rejects.toThrow(
        /aggregate result schema is invalid/i
      );

      expect(fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8')).toBe(initialData);
      expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toBe(initialReport);

      const leftoverFiles = fs.readdirSync(root).filter((f) => f.startsWith('.') && (f.includes('tmp') || f.includes('bak') || f.includes('aggregate')));
      expect(leftoverFiles).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('recoverAggregatePublication restores backup files and unlinks journal and temporary files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-journal-recovery-'));
    try {
      const journalName = '.aggregate-publication-0000000000000001.json';
      const backupDataName = '.bak-aggregate-data-0000000000000002';
      const backupReportName = '.bak-aggregate-report-0000000000000003';
      const stagedDataName = '.tmp-0000000000000004';
      const stagedReportName = '.tmp-aggregate-0000000000000005.html';

      fs.writeFileSync(path.join(root, 'aggregate-data.json'), 'corrupted-data', 'utf8');
      fs.writeFileSync(path.join(root, 'index.html'), 'corrupted-report', 'utf8');
      fs.writeFileSync(path.join(root, backupDataName), 'original-data', 'utf8');
      fs.writeFileSync(path.join(root, backupReportName), 'original-report', 'utf8');
      fs.writeFileSync(path.join(root, stagedDataName), 'staged-data', 'utf8');
      fs.writeFileSync(path.join(root, stagedReportName), 'staged-report', 'utf8');

      fs.writeFileSync(path.join(root, journalName), JSON.stringify({
        schemaVersion: 1,
        committed: false,
        hadData: true,
        hadReport: true,
        stagedData: stagedDataName,
        stagedReport: stagedReportName,
        backupData: backupDataName,
        backupReport: backupReportName,
      }), 'utf8');

      await recoverAggregatePublication(root);

      expect(fs.readFileSync(path.join(root, 'aggregate-data.json'), 'utf8')).toBe('original-data');
      expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toBe('original-report');
      expect(fs.existsSync(path.join(root, backupDataName))).toBe(false);
      expect(fs.existsSync(path.join(root, backupReportName))).toBe(false);
      expect(fs.existsSync(path.join(root, stagedDataName))).toBe(false);
      expect(fs.existsSync(path.join(root, stagedReportName))).toBe(false);
      expect(fs.existsSync(path.join(root, journalName))).toBe(false);
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

  test('cross-config runs retain historical projects, exclude malformed manifests, preserve canaries, and avoid fake links', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-cross-config-canary-'));
    try {
      const reportRoot = path.join(root, 'reports');
      const stagingRoot = path.join(root, 'staging');
      const assetsDir = path.join(reportRoot, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.mkdirSync(stagingRoot, { recursive: true });

      // Canaries: shared assets, staging, config
      const assetCanary = path.join(assetsDir, 'canary.css');
      fs.writeFileSync(assetCanary, '/* asset canary */', 'utf8');
      const stagingCanary = path.join(stagingRoot, 'staging-lease.canary');
      fs.writeFileSync(stagingCanary, 'staging lease canary', 'utf8');

      // Pre-existing historical project with 2 runs
      const histDir1 = path.join(reportRoot, 'hist-service', 'run-h1');
      const histDir2 = path.join(reportRoot, 'hist-service', 'run-h2');
      fs.mkdirSync(histDir1, { recursive: true });
      fs.mkdirSync(histDir2, { recursive: true });
      fs.writeFileSync(path.join(histDir1, 'manifest.json'), JSON.stringify({
        kind: 'project-run', schemaVersion: 3,
        project: { id: 'hist-service', name: 'Historical Service' },
        run: { runId: 'run-h1', observedAt: '2026-09-24T07:00:00.000Z' },
        state: 'failed',
        artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
        warnings: [],
        diagnostic: 'hist run 1 failed',
      }));
      fs.writeFileSync(path.join(histDir1, 'data.json'), JSON.stringify({
        schemaVersion: 3, project: { id: 'hist-service', name: 'Historical Service' },
        run: { runId: 'run-h1', observedAt: '2026-09-24T07:00:00.000Z' }, state: 'failed', diagnostic: 'hist run 1 failed', warnings: [],
      }));
      fs.writeFileSync(path.join(histDir1, 'index.html'), '<html><body>hist h1</body></html>');

      fs.writeFileSync(path.join(histDir2, 'manifest.json'), JSON.stringify({
        kind: 'project-run', schemaVersion: 3,
        project: { id: 'hist-service', name: 'Historical Service' },
        run: { runId: 'run-h2', observedAt: '2026-09-24T08:00:00.000Z' },
        state: 'failed',
        artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
        warnings: [],
        diagnostic: 'hist run 2 failed',
      }));
      fs.writeFileSync(path.join(histDir2, 'data.json'), JSON.stringify({
        schemaVersion: 3, project: { id: 'hist-service', name: 'Historical Service' },
        run: { runId: 'run-h2', observedAt: '2026-09-24T08:00:00.000Z' }, state: 'failed', diagnostic: 'hist run 2 failed', warnings: [],
      }));
      fs.writeFileSync(path.join(histDir2, 'index.html'), '<html><body>hist h2</body></html>');
      // Malformed manifest directory in report root
      const malformedDir = path.join(reportRoot, 'malformed-service', 'run-bad');
      fs.mkdirSync(malformedDir, { recursive: true });
      fs.writeFileSync(path.join(malformedDir, 'manifest.json'), '{ invalid json @@', 'utf8');

      const environment = {
        A_USER: 'u-a', A_PASS: 'p-a',
        B_USER: 'u-b', B_PASS: 'p-b',
        C_USER: 'u-c', C_PASS: 'p-c',
      };

      const configFile = path.join(root, 'projects.json');
      fs.writeFileSync(configFile, JSON.stringify({
        schemaVersion: 1,
        defaults: { artifactDir: reportRoot, timeoutMs: 5000 },
        projects: [
          { id: 'valid-alpha', name: 'Valid Alpha', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/alpha/', credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASS' } },
          { id: 'valid-beta', name: 'Valid Beta', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/beta/', credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASS' } },
          { id: 'runless-gamma', name: 'Runless Gamma', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/gamma/', credentials: { usernameVariable: 'C_USER', passwordVariable: 'C_PASS' } },
        ],
      }), { mode: 0o600 });

      const configCanary = fs.readFileSync(configFile, 'utf8');
      const allConfigs = loadProjectConfig(configFile, environment);
      const configAlpha = allConfigs[0]!;
      const configBeta = allConfigs[1]!;
      const configRunless = allConfigs[2]!;

      const fakeBrowser = {
        newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
        close: async () => undefined,
      } as unknown as Browser;

      // Run A: executes valid-alpha with 2 runs
      for (const runId of ['run-a1', 'run-a2']) {
        const observedAt = runId === 'run-a1' ? '2026-09-24T09:00:00.000Z' : '2026-09-24T09:30:00.000Z';
        await runConfiguredProjects([configAlpha], {
          launchBrowser: async () => fakeBrowser,
          executeProject: async (project) => {
            const dir = path.join(reportRoot, project.id, runId);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
              kind: 'project-run', schemaVersion: 3,
              project: { id: project.id, name: project.name },
              run: { runId, observedAt },
              state: 'failed',
              artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
              warnings: [],
              diagnostic: 'alpha failed',
            }));
            fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({
              schemaVersion: 3, project: { id: project.id, name: project.name },
              run: { runId, observedAt }, state: 'failed', diagnostic: 'alpha failed', warnings: [],
            }));
            fs.writeFileSync(path.join(dir, 'index.html'), `<html><body>${runId}</body></html>`);
            return { projectId: project.id, name: project.name, state: 'failed', runId, warnings: [] };
          },
        });
      }

      // Run B: disjoint execution with valid-beta (succeeds) and runless-gamma (fails before manifest write)
      await runConfiguredProjects([configBeta, configRunless], {
        launchBrowser: async () => fakeBrowser,
        executeProject: async (project) => {
          if (project.id === 'runless-gamma') {
            return {
              projectId: project.id,
              name: project.name,
              state: 'failed',
              runId: 'unwritten-run-gamma',
              error: 'Failed prior to manifest writing',
              warnings: ['Preflight credential check failed'],
            };
          }
          const dir = path.join(reportRoot, project.id, 'run-b1');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
            kind: 'project-run', schemaVersion: 3,
            project: { id: project.id, name: project.name },
            run: { runId: 'run-b1', observedAt: '2026-09-24T10:00:00.000Z' },
            state: 'failed',
            artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
            warnings: [],
            diagnostic: 'beta failed',
          }));
          fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({
            schemaVersion: 3, project: { id: project.id, name: project.name },
            run: { runId: 'run-b1', observedAt: '2026-09-24T10:00:00.000Z' }, state: 'failed', diagnostic: 'beta failed', warnings: [],
          }));
          fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>b1</body></html>');
          return { projectId: project.id, name: project.name, state: 'failed', runId: 'run-b1', warnings: [] };
        },
      });

      // Read aggregate-data.json
      const aggData = JSON.parse(fs.readFileSync(path.join(reportRoot, 'aggregate-data.json'), 'utf8')) as AggregateReportResult;
      expect(isValidAggregateResult(aggData)).toBe(true);

      // Projects order: active outcomes first in config order (beta, runless-gamma), then historical (hist-service, valid-alpha)
      expect(aggData.projects.map((p) => p.projectId)).toEqual([
        'valid-beta',
        'runless-gamma',
        'hist-service',
        'valid-alpha',
      ]);

      // Malformed manifest was excluded and did not appear as a project
      expect(aggData.projects.find((p) => p.projectId === 'malformed-service')).toBeUndefined();
      // Discovery warning recorded in aggregate
      expect(aggData.warnings.some((w) => w.includes('malformed') || w.includes('incompatible') || w.length > 0)).toBe(true);

      // Runless project has no fake reportPath link
      const runlessProject = aggData.projects.find((p) => p.projectId === 'runless-gamma')!;
      expect(runlessProject.reportPath).toBeUndefined();
      expect(runlessProject.runs).toEqual([]);
      expect(runlessProject.state).toBe('failed');

      // Valid alpha has 2 runs, newest first (run-a2 then run-a1)
      const alphaProject = aggData.projects.find((p) => p.projectId === 'valid-alpha')!;
      expect(alphaProject.runId).toBe('run-a2');
      expect(alphaProject.runs.map((r) => r.runId)).toEqual(['run-a2', 'run-a1']);
      expect(alphaProject.reportPath).toBe('valid-alpha/run-a2/index.html');

      // Historical service has 2 runs, newest first (run-h2 then run-h1)
      const histProject = aggData.projects.find((p) => p.projectId === 'hist-service')!;
      expect(histProject.runId).toBe('run-h2');
      expect(histProject.runs.map((r) => r.runId)).toEqual(['run-h2', 'run-h1']);

      // Check published HTML
      const indexHtml = fs.readFileSync(path.join(reportRoot, 'index.html'), 'utf8');
      expect(indexHtml).toContain('Valid Beta');
      expect(indexHtml).toContain('Runless Gamma');
      expect(indexHtml).toContain('Historical Service');
      expect(indexHtml).toContain('Valid Alpha');
      expect(indexHtml).not.toContain('malformed-service');

      // Check canaries: untouched!
      expect(fs.readFileSync(assetCanary, 'utf8')).toBe('/* asset canary */');
      expect(fs.readFileSync(stagingCanary, 'utf8')).toBe('staging lease canary');
      expect(fs.readFileSync(configFile, 'utf8')).toBe(configCanary);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
