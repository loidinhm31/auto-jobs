import { expect, test } from '@playwright/test';
import type { ProjectConfigDocumentV1 } from '../../src/config/config-types.js';
import {
  assertProjectConfigDocument,
  GROUP_ID_REGEX,
  validateProjectGroup,
  validateProjectGroups,
} from '../../src/config.js';

function baseDocument(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/service-a/',
      },
    ],
  };
}

test('accepts legacy documents without projectGroups and projects without groupId', () => {
  const doc = baseDocument();
  const parsed = assertProjectConfigDocument(doc);
  expect(parsed.projectGroups).toBeUndefined();
  expect(parsed.projects[0]?.groupId).toBeUndefined();
});

test('accepts document with empty projectGroups array', () => {
  const doc: ProjectConfigDocumentV1 = {
    ...baseDocument(),
    projectGroups: [],
  };
  const parsed = assertProjectConfigDocument(doc);
  expect(parsed.projectGroups).toEqual([]);
});

test('accepts document with valid groups and assigned projects', () => {
  const doc: ProjectConfigDocumentV1 = {
    schemaVersion: 1,
    projectGroups: [
      { id: 'backend', name: 'Backend Services' },
      { id: 'frontend', name: 'Frontend Apps' },
    ],
    projects: [
      {
        id: 'service-a',
        name: 'Service A',
        groupId: 'backend',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/service-a/',
      },
      {
        id: 'web-app',
        name: 'Web App',
        groupId: 'frontend',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/web-app/',
      },
      {
        id: 'ungrouped-svc',
        name: 'Ungrouped Service',
        loginUrl: 'https://jenkins.example/jenkins/login',
        jobUrl: 'https://jenkins.example/jenkins/job/ungrouped-svc/',
      },
    ],
  };
  const parsed = assertProjectConfigDocument(doc);
  expect(parsed.projectGroups?.length).toBe(2);
  expect(parsed.projects[0]?.groupId).toBe('backend');
  expect(parsed.projects[1]?.groupId).toBe('frontend');
  expect(parsed.projects[2]?.groupId).toBeUndefined();
});

test('allows duplicate display names for different group IDs', () => {
  const doc: ProjectConfigDocumentV1 = {
    ...baseDocument(),
    projectGroups: [
      { id: 'group-1', name: 'Duplicate Name' },
      { id: 'group-2', name: 'Duplicate Name' },
    ],
  };
  expect(() => assertProjectConfigDocument(doc)).not.toThrow();
});

test('rejects non-array projectGroups', () => {
  for (const invalid of [null, 'backend', 123, true, {}]) {
    expect(() =>
      assertProjectConfigDocument({
        ...baseDocument(),
        projectGroups: invalid as unknown as ProjectConfigDocumentV1['projectGroups'],
      }),
    ).toThrow(/config\.projectGroups must be an array/u);
  }
});

test('rejects projectGroups exceeding maximum limit of 50', () => {
  const groups = Array.from({ length: 51 }, (_, i) => ({
    id: `group-${i + 1}`,
    name: `Group ${i + 1}`,
  }));
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: groups,
    }),
  ).toThrow(/must contain at most 50 groups/u);
});

test('accepts exactly 50 groups boundary', () => {
  const groups = Array.from({ length: 50 }, (_, i) => ({
    id: `group-${i + 1}`,
    name: `Group ${i + 1}`,
  }));
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: groups,
    }),
  ).not.toThrow();
});

test('rejects group entries that are not objects', () => {
  for (const item of [null, 'invalid', 42, true, []]) {
    expect(() =>
      assertProjectConfigDocument({
        ...baseDocument(),
        projectGroups: [item as unknown as { id: string; name: string }],
      }),
    ).toThrow(/config\.projectGroups\[0\] must be an object/u);
  }
});

test('rejects unsupported keys on group entries', () => {
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [
        {
          id: 'backend',
          name: 'Backend',
          extraProperty: 'not-allowed',
        } as unknown as { id: string; name: string },
      ],
    }),
  ).toThrow(/config\.projectGroups\[0\]\.extraProperty is not supported/u);
});

test('rejects invalid group id syntax and length', () => {
  for (const badId of [
    '',
    '   ',
    '-leading-hyphen',
    'UPPERCASE',
    'with spaces',
    'special_char',
    'a'.repeat(64),
  ]) {
    expect(() =>
      assertProjectConfigDocument({
        ...baseDocument(),
        projectGroups: [{ id: badId, name: 'Valid Name' }],
      }),
    ).toThrow(/config\.projectGroups\[0\]\.id/u);
  }
});

test('accepts valid group id syntax and 63-char length boundary', () => {
  const maxValidId = 'a' + 'b'.repeat(62);
  expect(maxValidId.length).toBe(63);
  expect(GROUP_ID_REGEX.test(maxValidId)).toBe(true);

  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [
        { id: 'group', name: 'Simple' },
        { id: 'group-2', name: 'Hyphenated' },
        { id: '0-number-start', name: 'Numeric' },
        { id: maxValidId, name: 'Max length' },
      ],
    }),
  ).not.toThrow();
});

test('rejects invalid group name', () => {
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [{ id: 'backend', name: '' }],
    }),
  ).toThrow(/config\.projectGroups\[0\]\.name must be a non-empty string/u);

  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [{ id: 'backend', name: '   ' }],
    }),
  ).toThrow(/config\.projectGroups\[0\]\.name must be a non-empty string/u);

  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [{ id: 'backend', name: 'a'.repeat(201) }],
    }),
  ).toThrow(/config\.projectGroups\[0\]\.name exceeds the safe string limit/u);

  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [{ id: 'backend', name: 'Bad\x00Control' }],
    }),
  ).toThrow(/config\.projectGroups\[0\]\.name exceeds the safe string limit/u);
});

test('rejects duplicate group ids', () => {
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [
        { id: 'backend', name: 'Backend 1' },
        { id: 'backend', name: 'Backend 2' },
      ],
    }),
  ).toThrow(/duplicate group id: backend/u);
});

test('rejects invalid project groupId syntax', () => {
  for (const badGroupId of [
    '',
    '   ',
    '-leading-hyphen',
    'UPPERCASE',
    'with space',
    'special!',
  ]) {
    expect(() =>
      assertProjectConfigDocument({
        ...baseDocument(),
        projects: [
          {
            ...baseDocument().projects[0]!,
            groupId: badGroupId,
          },
        ],
      }),
    ).toThrow(/projects\[0\]\.groupId/u);
  }
});

test('rejects dangling project groupId referencing nonexistent group', () => {
  // Case 1: projectGroups undefined
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projects: [
        {
          ...baseDocument().projects[0]!,
          groupId: 'nonexistent-group',
        },
      ],
    }),
  ).toThrow(/projects\[0\]\.groupId references unknown group: nonexistent-group/u);

  // Case 2: projectGroups empty
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [],
      projects: [
        {
          ...baseDocument().projects[0]!,
          groupId: 'nonexistent-group',
        },
      ],
    }),
  ).toThrow(/projects\[0\]\.groupId references unknown group: nonexistent-group/u);

  // Case 3: projectGroups has groups, but not this one
  expect(() =>
    assertProjectConfigDocument({
      ...baseDocument(),
      projectGroups: [{ id: 'frontend', name: 'Frontend' }],
      projects: [
        {
          ...baseDocument().projects[0]!,
          groupId: 'backend',
        },
      ],
    }),
  ).toThrow(/projects\[0\]\.groupId references unknown group: backend/u);
});

test('validates standalone group and groups helpers directly', () => {
  const issues: string[] = [];
  validateProjectGroup({ id: 'valid-id', name: 'Valid' }, 0, issues);
  expect(issues).toEqual([]);

  const badIssues: string[] = [];
  validateProjectGroup({ id: 'INVALID', name: '' }, 0, badIssues);
  expect(badIssues.length).toBeGreaterThan(0);

  const groupIssues: string[] = [];
  validateProjectGroups(
    [{ id: 'g1', name: 'G1' }],
    [{ id: 'p1', groupId: 'g1' }],
    groupIssues,
  );
  expect(groupIssues).toEqual([]);
});
