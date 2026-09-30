import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  validateRunTargetCoordinates,
  parseRunApiTargets,
  resolveRunTargets,
  assertNoArtifactCollisions,
  type RunTargetCoordinate,
} from '../../src/reporting/control-run-targets.js';
import type { NormalizedProjectConfig, ProjectConfigDocumentV1 } from '../../src/config/config-types.js';

test.describe('Control Run Targets & Matrix Validation', () => {
  test.describe('validateRunTargetCoordinates', () => {
    test('accepts valid coordinates', () => {
      const result = validateRunTargetCoordinates([
        { projectId: 'proj-1', columnId: 'col-a' },
        { projectId: 'proj-1', columnId: 'col-b' },
        { projectId: 'proj-2', columnId: 'col-a' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.coordinates).toHaveLength(3);
    });

    test('rejects non-array with 422', () => {
      const result = validateRunTargetCoordinates('invalid');
      expect(result.valid).toBe(false);
      expect(result.status).toBe(422);
      expect(result.code).toBe('INVALID_TARGETS');
    });

    test('rejects empty array with 422', () => {
      const result = validateRunTargetCoordinates([]);
      expect(result.valid).toBe(false);
      expect(result.status).toBe(422);
      expect(result.message).toContain('empty');
    });

    test('rejects array exceeding 2500 coordinates', () => {
      const coords: RunTargetCoordinate[] = [];
      for (let i = 0; i < 2501; i++) {
        coords.push({ projectId: `proj-${i}`, columnId: 'c1' });
      }
      const result = validateRunTargetCoordinates(coords);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('exceed 2500');
    });

    test('rejects items with extra unexpected keys', () => {
      const result = validateRunTargetCoordinates([
        { projectId: 'proj-1', columnId: 'col-1', extra: 'bad' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('must contain only projectId and columnId');
    });

    test('rejects invalid project IDs (uppercase or special chars)', () => {
      const res1 = validateRunTargetCoordinates([{ projectId: 'PROJ_1', columnId: 'col-1' }]);
      expect(res1.valid).toBe(false);

      const res2 = validateRunTargetCoordinates([{ projectId: 'a'.repeat(64), columnId: 'col-1' }]);
      expect(res2.valid).toBe(false);
    });

    test('rejects invalid column IDs (uppercase or too long)', () => {
      const res1 = validateRunTargetCoordinates([{ projectId: 'proj-1', columnId: 'COL_1' }]);
      expect(res1.valid).toBe(false);

      const res2 = validateRunTargetCoordinates([{ projectId: 'proj-1', columnId: 'a'.repeat(17) }]);
      expect(res2.valid).toBe(false);
    });

    test('rejects duplicate coordinate pairs', () => {
      const result = validateRunTargetCoordinates([
        { projectId: 'proj-1', columnId: 'col-1' },
        { projectId: 'proj-1', columnId: 'col-1' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('duplicate coordinate');
    });
  });

  test.describe('parseRunApiTargets', () => {
    test('parses valid matrix targets and checks unknown request fields', () => {
      const parsed = parseRunApiTargets(
        {
          configName: 'default.json',
          configEtag: 'tag1',
          runType: 'report',
          targets: [{ projectId: 'p1', columnId: 'c1' }],
        },
        'report',
      );
      expect(parsed.ok).toBe(true);
      expect(parsed.targets).toHaveLength(1);
    });

    test('rejects unknown request fields when targets are present', () => {
      const parsed = parseRunApiTargets(
        {
          configName: 'default.json',
          configEtag: 'tag1',
          runType: 'report',
          targets: [{ projectId: 'p1', columnId: 'c1' }],
          unknownField: true,
        },
        'report',
      );
      expect(parsed.ok).toBe(false);
      expect(parsed.status).toBe(422);
      expect(parsed.message).toContain("unknown field 'unknownField'");
    });

    test('rejects projectId when targets are present', () => {
      const parsed = parseRunApiTargets(
        {
          configName: 'default.json',
          configEtag: 'tag1',
          runType: 'report',
          targets: [{ projectId: 'p1', columnId: 'c1' }],
          projectId: 'p1',
        },
        'report',
      );
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toContain('projectId must not be provided when targets are specified');
    });

    test('falls back to legacy projectId parsing when targets absent', () => {
      const parsed = parseRunApiTargets(
        {
          configName: 'default.json',
          configEtag: 'tag1',
          runType: 'auto-build',
          projectId: 'my-project',
        },
        'auto-build',
      );
      expect(parsed.ok).toBe(true);
      expect(parsed.projectId).toBe('my-project');
    });
  });

  test.describe('resolveRunTargets', () => {
    const validDoc: ProjectConfigDocumentV1 = {
      schemaVersion: 1,
      jobColumns: [
        { id: 'col-a', name: 'Column A' },
        { id: 'col-b', name: 'Column B' },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'Project One',
          loginUrl: 'https://jenkins.example.com/login',
          jobUrl: 'https://jenkins.example.com/job/proj1-a/',
          selectedJobColumns: ['col-a', 'col-b'],
          jobs: {
            'col-a': 'https://jenkins.example.com/job/proj1-a/',
            'col-b': 'https://jenkins.example.com/job/proj1-b/',
          },
        },
        {
          id: 'proj-2',
          name: 'Project Two',
          loginUrl: 'https://jenkins.example.com/login',
          jobUrl: 'https://jenkins.example.com/job/proj2-a/',
          selectedJobColumns: ['col-a', 'col-b'],
          jobs: {
            'col-a': 'https://jenkins.example.com/job/proj2-a/',
            'col-b': '  ', // blank cell
          },
        },
        {
          id: 'proj-disabled',
          name: 'Project Disabled',
          enabled: false,
          loginUrl: 'https://jenkins.example.com/login',
          jobUrl: 'https://jenkins.example.com/job/disabled/',
          selectedJobColumns: ['col-a', 'col-b'],
          jobs: {
            'col-a': 'https://jenkins.example.com/job/disabled/',
            'col-b': '',
          },
        },
      ],
    };

    test('resolves and orders targets in saved project then column heading order', () => {
      // Requested in reverse order
      const coordinates: RunTargetCoordinate[] = [
        { projectId: 'proj-2', columnId: 'col-a' },
        { projectId: 'proj-1', columnId: 'col-b' },
        { projectId: 'proj-1', columnId: 'col-a' },
      ];

      const { targets, skippedCoordinates } = resolveRunTargets(
        validDoc,
        coordinates,
        'report',
        process.env,
      );

      expect(skippedCoordinates).toHaveLength(0);
      expect(targets).toHaveLength(3);
      // Deterministic order: proj-1::col-a, proj-1::col-b, proj-2::col-a
      expect(targets[0]?.virtualProjectId).toBe('proj-1--col-a');
      expect(targets[1]?.virtualProjectId).toBe('proj-1--col-b');
      expect(targets[2]?.virtualProjectId).toBe('proj-2--col-a');
      expect(targets[0]?.virtualProjectName).toBe('Project One [Column A]');
    });

    test('skips blank cells and records them in skippedCoordinates', () => {
      const coordinates: RunTargetCoordinate[] = [
        { projectId: 'proj-2', columnId: 'col-a' },
        { projectId: 'proj-2', columnId: 'col-b' }, // blank cell
      ];

      const { targets, skippedCoordinates } = resolveRunTargets(
        validDoc,
        coordinates,
        'report',
        process.env,
      );

      expect(targets).toHaveLength(1);
      expect(targets[0]?.virtualProjectId).toBe('proj-2--col-a');
      expect(skippedCoordinates).toHaveLength(1);
      expect(skippedCoordinates[0]).toEqual({ projectId: 'proj-2', columnId: 'col-b' });
    });

    test('throws error if all selected coordinates are blank', () => {
      const coordinates: RunTargetCoordinate[] = [{ projectId: 'proj-2', columnId: 'col-b' }];

      expect(() => resolveRunTargets(validDoc, coordinates, 'report', process.env)).toThrow(
        'No executable targets remaining after skipping blank cells',
      );
    });

    test('throws error on unknown project ID', () => {
      const coordinates: RunTargetCoordinate[] = [{ projectId: 'non-existent', columnId: 'col-a' }];

      expect(() => resolveRunTargets(validDoc, coordinates, 'report', process.env)).toThrow(
        "Unknown project id: 'non-existent'",
      );
    });

    test('throws error on disabled project', () => {
      const coordinates: RunTargetCoordinate[] = [{ projectId: 'proj-disabled', columnId: 'col-a' }];

      expect(() => resolveRunTargets(validDoc, coordinates, 'report', process.env)).toThrow(
        "Project 'proj-disabled' is disabled",
      );
    });

    test('throws error on undeclared column ID', () => {
      const coordinates: RunTargetCoordinate[] = [{ projectId: 'proj-1', columnId: 'col-unknown' }];

      expect(() => resolveRunTargets(validDoc, coordinates, 'report', process.env)).toThrow(
        "Undeclared column id: 'col-unknown'",
      );
    });

    test('throws error on collision between virtual target ID and existing real project ID', () => {
      const docWithCollision: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        jobColumns: [{ id: 'col-a', name: 'Column A' }],
        projects: [
          {
            id: 'proj',
            name: 'P1',
            loginUrl: 'https://jenkins.example.com/login',
            jobUrl: 'https://jenkins.example.com/job/1/',
            selectedJobColumns: ['col-a'],
            jobs: { 'col-a': 'https://jenkins.example.com/job/1/' },
          },
          {
            id: 'proj--col-a', // Collides with proj + col-a
            name: 'Real Project Colliding',
            loginUrl: 'https://jenkins.example.com/login',
            jobUrl: 'https://jenkins.example.com/job/2/',
            selectedJobColumns: ['col-a'],
            jobs: { 'col-a': 'https://jenkins.example.com/job/2/' },
          },
        ],
      };

      expect(() =>
        resolveRunTargets(docWithCollision, [{ projectId: 'proj', columnId: 'col-a' }], 'report', process.env),
      ).toThrow("Virtual target id 'proj--col-a' collides with an existing project id");
    });
  });

  test.describe('assertNoArtifactCollisions', () => {
    let tempRoot: string;

    test.beforeEach(async () => {
      tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artifact-coll-test-'));
    });

    test.afterEach(async () => {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    });

    test('allows target when no artifacts exist on disk', async () => {
      const targets = [
        {
          coordinate: { projectId: 'p1', columnId: 'c1' },
          sourceProjectId: 'p1',
          sourceProjectName: 'Project 1',
          columnId: 'c1',
          columnName: 'Col 1',
          jobUrl: 'https://jenkins.example.com/job/1/',
          virtualProjectId: 'p1--c1',
          virtualProjectName: 'Project 1 [Col 1]',
          virtualProject: {} as unknown as NormalizedProjectConfig,
        },
      ];

      await expect(assertNoArtifactCollisions(tempRoot, targets)).resolves.toBeUndefined();
    });

    test('fails closed if unassociated historical directory without provenance exists for virtual ID', async () => {
      // Create historical manifest for p1--c1 without provenance
      const runDir = path.join(tempRoot, 'p1--c1', 'run-20260930-0001');
      await fs.promises.mkdir(runDir, { recursive: true });
      const manifest = {
        kind: 'project-run',
        schemaVersion: 3,
        project: { id: 'p1--c1', name: 'Legacy Project' },
        run: { runId: 'run-20260930-0001', observedAt: '2026-09-30T00:00:00.000Z' },
        state: 'failed',
        diagnostic: 'failed execution',
        artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
        warnings: [],
      };
      const data = {
        schemaVersion: 3,
        project: { id: 'p1--c1', name: 'Legacy Project' },
        run: { runId: 'run-20260930-0001', observedAt: '2026-09-30T00:00:00.000Z' },
        state: 'failed',
        diagnostic: 'failed execution',
        warnings: [],
      };
      await fs.promises.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest));
      await fs.promises.writeFile(path.join(runDir, 'data.json'), JSON.stringify(data));

      const targets = [
        {
          coordinate: { projectId: 'p1', columnId: 'c1' },
          sourceProjectId: 'p1',
          sourceProjectName: 'Project 1',
          columnId: 'c1',
          columnName: 'Col 1',
          jobUrl: 'https://jenkins.example.com/job/1/',
          virtualProjectId: 'p1--c1',
          virtualProjectName: 'Project 1 [Col 1]',
          virtualProject: {} as unknown as NormalizedProjectConfig,
        },
      ];

      await expect(assertNoArtifactCollisions(tempRoot, targets)).rejects.toThrow(
        "collides with existing unassociated artifact history",
      );
    });

    test('allows target when historical artifact has matching matrix provenance', async () => {
      const runDir = path.join(tempRoot, 'p1--c1', 'run-20260930-0001');
      await fs.promises.mkdir(runDir, { recursive: true });
      const prov = {
        sourceProjectId: 'p1',
        sourceProjectName: 'Project 1',
        columnId: 'c1',
        columnName: 'Col 1',
      };
      const manifest = {
        kind: 'project-run',
        schemaVersion: 3,
        project: { id: 'p1--c1', name: 'Project 1 [Col 1]' },
        run: { runId: 'run-20260930-0001', observedAt: '2026-09-30T00:00:00.000Z' },
        state: 'failed',
        diagnostic: 'failed execution',
        artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [] },
        warnings: [],
        provenance: prov,
      };
      const data = {
        schemaVersion: 3,
        project: { id: 'p1--c1', name: 'Project 1 [Col 1]' },
        run: { runId: 'run-20260930-0001', observedAt: '2026-09-30T00:00:00.000Z' },
        state: 'failed',
        diagnostic: 'failed execution',
        warnings: [],
        provenance: prov,
      };
      await fs.promises.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest));
      await fs.promises.writeFile(path.join(runDir, 'data.json'), JSON.stringify(data));

      const targets = [
        {
          coordinate: { projectId: 'p1', columnId: 'c1' },
          sourceProjectId: 'p1',
          sourceProjectName: 'Project 1',
          columnId: 'c1',
          columnName: 'Col 1',
          jobUrl: 'https://jenkins.example.com/job/1/',
          virtualProjectId: 'p1--c1',
          virtualProjectName: 'Project 1 [Col 1]',
          virtualProject: {} as unknown as NormalizedProjectConfig,
        },
      ];

      await expect(assertNoArtifactCollisions(tempRoot, targets)).resolves.toBeUndefined();
    });
  });
});
