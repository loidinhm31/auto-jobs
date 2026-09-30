import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  assertProjectConfigDocument,
  DEFAULT_JOB_COLUMN,
  loadProjectConfig,
  projectLegacyMatrixDocument,
  type ProjectConfigDocumentV1,
} from '../../src/config.js';

function writeConfigFile(document: unknown): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-spec-'));
  const filePath = path.join(directory, 'projects.json');
  fs.writeFileSync(filePath, JSON.stringify(document, null, 2), { mode: 0o600 });
  return filePath;
}

function baseLegacyDocument(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    projectGroups: [{ id: 'team-a', name: 'Team A' }],
    defaults: {
      timeoutMs: 30_000,
    },
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        groupId: 'team-a',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/service-a-build/',
        runType: 'report',
      },
      {
        id: 'service-b',
        name: 'Service B',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/service-b-build/',
        runType: 'auto-build',
      },
    ],
  };
}

function baseMatrixDocument(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    jobColumns: [
      { id: 'build', name: 'Build Job' },
      { id: 'smoke', name: 'Smoke Test' },
    ],
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/service-a-build/',
        jobs: {
          build: 'https://jenkins.example/jenkins/job/service-a-build/',
          smoke: 'https://jenkins.example/jenkins/job/service-a-smoke/',
        },
        selectedJobColumns: ['build', 'smoke'],
      },
    ],
  };
}

test.describe('Job Matrix Schema Validation (Phase 01)', () => {
  test('validates a complete matrix document with multiple columns and selections', () => {
    const doc = baseMatrixDocument();
    const result = assertProjectConfigDocument(doc);
    expect(result.jobColumns).toHaveLength(2);
    expect(result.projects[0]?.jobs?.['build']).toBe(
      'https://jenkins.example/jenkins/job/service-a-build/',
    );
    expect(result.projects[0]?.selectedJobColumns).toEqual(['build', 'smoke']);
  });

  test('accepts blank cell URLs as long as one nonblank URL exists and mirrors jobUrl', () => {
    const doc: ProjectConfigDocumentV1 = {
      schemaVersion: 1,
      jobColumns: [
        { id: 'first', name: 'First' },
        { id: 'second', name: 'Second' },
      ],
      projects: [
        {
          id: 'service-a',
          name: 'Service A',
          loginUrl: 'https://jenkins.example/jenkins/login',
          jobUrl: 'https://jenkins.example/jenkins/job/second-job/',
          jobs: {
            first: '',
            second: 'https://jenkins.example/jenkins/job/second-job/',
          },
          selectedJobColumns: ['second'],
        },
      ],
    };

    const validated = assertProjectConfigDocument(doc);
    expect(validated.projects[0]?.jobUrl).toBe('https://jenkins.example/jenkins/job/second-job/');
  });

  test('allows an empty selection array for explicit non-selection', () => {
    const doc = baseMatrixDocument();
    const project = {
      ...doc.projects[0]!,
      selectedJobColumns: [],
    };
    const validated = assertProjectConfigDocument({
      ...doc,
      projects: [project],
    });
    expect(validated.projects[0]?.selectedJobColumns).toEqual([]);
  });

  test('rejects 0 job columns or more than maxJobColumns', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({ ...base, jobColumns: [] }),
    ).toThrow(/config\.jobColumns must contain 1 to 50 columns/u);

    const oversized = Array.from({ length: 51 }, (_, i) => ({
      id: `col-${i}`,
      name: `Column ${i}`,
    }));
    expect(() =>
      assertProjectConfigDocument({ ...base, jobColumns: oversized }),
    ).toThrow(/config\.jobColumns must contain 1 to 50 columns/u);
  });

  test('rejects invalid column IDs and empty names', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        jobColumns: [{ id: 'Invalid_ID', name: 'Col' }],
      }),
    ).toThrow(/lowercase safe characters/u);

    expect(() =>
      assertProjectConfigDocument({
        ...base,
        jobColumns: [{ id: 'a'.repeat(17), name: 'Col' }],
      }),
    ).toThrow(/at most 16 characters/u);

    expect(() =>
      assertProjectConfigDocument({
        ...base,
        jobColumns: [{ id: 'valid-id', name: '   ' }],
      }),
    ).toThrow(/must not be empty/u);
  });

  test('rejects duplicate column IDs and unknown properties on column objects', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        jobColumns: [
          { id: 'col-a', name: 'A' },
          { id: 'col-a', name: 'A duplicate' },
        ],
      }),
    ).toThrow(/duplicate job column id: col-a/u);

    expect(() =>
      assertProjectConfigDocument({
        ...base,
        jobColumns: [{ id: 'col-a', name: 'A', extraProp: true } as unknown as { id: string; name: string }],
      }),
    ).toThrow(/config\.jobColumns\[0\]\.extraProp is not supported/u);
  });

  test('rejects dangerous prototype-poisoning keys in jobs map', () => {
    const base = baseMatrixDocument();
    const maliciousJobs = JSON.parse(
      '{"build": "https://jenkins.example/jenkins/job/service-a-build/", "smoke": "https://jenkins.example/jenkins/job/service-a-smoke/", "__proto__": "https://evil.example"}'
    );
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            jobs: maliciousJobs as unknown as Record<string, string>,
          },
        ],
      }),
    ).toThrow(/jobs\.__proto__ is not supported/u);
  });

  test('rejects missing declared column keys or undeclared column keys in jobs', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            jobs: {
              build: 'https://jenkins.example/jenkins/job/service-a-build/',
            },
          },
        ],
      }),
    ).toThrow(/projects\[0\]\.jobs\.smoke is required/u);

    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            jobs: {
              build: 'https://jenkins.example/jenkins/job/service-a-build/',
              smoke: 'https://jenkins.example/jenkins/job/service-a-smoke/',
              unknownCol: 'https://jenkins.example/jenkins/job/extra/',
            },
          },
        ],
      }),
    ).toThrow(/projects\[0\]\.jobs\.unknownCol is not supported/u);
  });
  test('handles declared constructor column with own-property membership check', () => {
    const docWithConstructorCol: ProjectConfigDocumentV1 = {
      schemaVersion: 1,
      jobColumns: [
        { id: 'constructor', name: 'Constructor Column' },
      ],
      projects: [
        {
          id: 'service-a',
          name: 'Service A',
          loginUrl: 'https://jenkins.example/jenkins/login',
          jobUrl: 'https://jenkins.example/jenkins/job/service-a-build/',
          jobs: {},
          selectedJobColumns: ['constructor'],
        },
      ],
    };

    expect(() =>
      assertProjectConfigDocument(docWithConstructorCol),
    ).toThrow(/projects\[0\]\.jobs\.constructor is required/u);

    const validDocWithConstructor: ProjectConfigDocumentV1 = {
      ...docWithConstructorCol,
      projects: [
        {
          ...docWithConstructorCol.projects[0]!,
          jobs: {
            constructor: 'https://jenkins.example/jenkins/job/service-a-build/',
          },
        },
      ],
    };
    const validated = assertProjectConfigDocument(validDocWithConstructor);
    expect(validated.projects[0]?.jobs?.['constructor']).toBe(
      'https://jenkins.example/jenkins/job/service-a-build/',
    );
  });


  test('rejects malformed cell URLs and cross-context Jenkins URLs', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            jobs: {
              build: 'https://jenkins.example/jenkins/job/service-a-build/',
              smoke: 'not-an-absolute-url',
            },
          },
        ],
      }),
    ).toThrow(/absolute HTTP\(S\) URL/u);

    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            jobs: {
              build: 'https://jenkins.example/jenkins/job/service-a-build/',
              smoke: 'https://jenkins.example/other-context/job/smoke/',
            },
          },
        ],
      }),
    ).toThrow(/share the Jenkins login context|base context/u);
  });

  test('enforces primary jobUrl mirror invariant matching first nonblank column', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            jobUrl: 'https://jenkins.example/jenkins/job/wrong-mirror/',
          },
        ],
      }),
    ).toThrow(/jobUrl must mirror first nonblank job column URL \(build\)/u);
  });

  test('rejects project where all matrix cells are blank', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            jobs: {
              build: '',
              smoke: '   ',
            },
          },
        ],
      }),
    ).toThrow(/projects\[0\] must contain at least one nonblank job URL/u);
  });

  test('rejects undeclared or duplicate entries in selectedJobColumns', () => {
    const base = baseMatrixDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            selectedJobColumns: ['build', 'ghost-column'],
          },
        ],
      }),
    ).toThrow(/contains undeclared column id: ghost-column/u);

    expect(() =>
      assertProjectConfigDocument({
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            selectedJobColumns: ['build', 'build'],
          },
        ],
      }),
    ).toThrow(/contains duplicate column id: build/u);
  });

  test('rejects stray matrix keys on legacy documents without root jobColumns', () => {
    const legacy = baseLegacyDocument();
    expect(() =>
      assertProjectConfigDocument({
        ...legacy,
        projects: [
          {
            ...legacy.projects[0]!,
            jobs: { default: 'https://jenkins.example/jenkins/job/a/' },
          },
          legacy.projects[1]!,
        ],
      }),
    ).toThrow(/projects\[0\]\.jobs is not supported without config\.jobColumns/u);

    expect(() =>
      assertProjectConfigDocument({
        ...legacy,
        projects: [
          legacy.projects[0]!,
          {
            ...legacy.projects[1]!,
            selectedJobColumns: ['default'],
          },
        ],
      }),
    ).toThrow(/projects\[1\]\.selectedJobColumns is not supported without config\.jobColumns/u);
  });
});

test.describe('In-Memory Legacy Projection & Idempotence (projectLegacyMatrixDocument)', () => {
  test('projects legacy document into single default column and preserves all fields', () => {
    const legacy = baseLegacyDocument();
    const upgraded = projectLegacyMatrixDocument(legacy);

    expect(upgraded.jobColumns).toEqual([DEFAULT_JOB_COLUMN]);
    expect(upgraded.projects).toHaveLength(2);
    expect(upgraded.projects[0]?.jobs).toEqual({
      default: 'https://jenkins.example/jenkins/job/service-a-build/',
    });
    expect(upgraded.projects[0]?.selectedJobColumns).toEqual(['default']);
    expect(upgraded.projects[1]?.jobs).toEqual({
      default: 'https://jenkins.example/jenkins/job/service-b-build/',
    });
    expect(upgraded.projects[1]?.selectedJobColumns).toEqual(['default']);

    // Non-matrix fields preserved
    expect(upgraded.projectGroups).toEqual(legacy.projectGroups);
    expect(upgraded.defaults).toEqual(legacy.defaults);
    expect(upgraded.projects[0]?.groupId).toBe('team-a');
    expect(upgraded.projects[0]?.runType).toBe('report');
    expect(upgraded.projects[1]?.runType).toBe('auto-build');

    // Validated matrix schema accepts the upgraded document
    const validated = assertProjectConfigDocument(upgraded);
    expect(validated.jobColumns).toBeDefined();
  });

  test('is strictly idempotent: upgrade(upgrade(doc)) deeply equals upgrade(doc)', () => {
    const legacy = baseLegacyDocument();
    const once = projectLegacyMatrixDocument(legacy);
    const twice = projectLegacyMatrixDocument(once);

    expect(twice).toEqual(once);
  });

  test('preserves existing jobColumns and explicit empty selection without resetting to default', () => {
    const doc = baseMatrixDocument();
    const projectWithEmptySelection = {
      ...doc.projects[0]!,
      selectedJobColumns: [],
    };
    const matrixDoc: ProjectConfigDocumentV1 = {
      ...doc,
      projects: [projectWithEmptySelection],
    };

    const upgraded = projectLegacyMatrixDocument(matrixDoc);
    expect(upgraded.jobColumns).toEqual(doc.jobColumns);
    expect(upgraded.projects[0]?.selectedJobColumns).toEqual([]);
  });
});

test.describe('Direct CLI Loader & Mirror Compatibility', () => {
  test('loads matrix document through loadProjectConfig using scalar jobUrl mirror', () => {
    const matrixDoc = baseMatrixDocument();
    const filePath = writeConfigFile(matrixDoc);
    try {
      const loaded = loadProjectConfig(filePath, {
        JENKINS_USERNAME: 'user',
        JENKINS_PASSWORD: 'pw',
      });
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.id).toBe('service-a');
      expect(loaded[0]?.jobUrl).toBe('https://jenkins.example/jenkins/job/service-a-build/');
      expect(loaded[0]?.runType).toBe('report');
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });
});
