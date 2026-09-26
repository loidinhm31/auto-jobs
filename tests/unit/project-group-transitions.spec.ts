import { expect, test } from '@playwright/test';
import type { ProjectConfigDocumentV1 } from '../../src/reporting/control-page/types/index.js';
import {
  createProjectGroup,
  deleteProjectGroup,
  generateGroupId,
  getGroupProjects,
  renameProjectGroup,
  replaceGroupMembership,
} from '../../src/reporting/control-page/hooks/project-group-transitions.js';

function createSampleDocument(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    projectGroups: [
      { id: 'group-a', name: 'Group A' },
      { id: 'group-b', name: 'Group B' },
    ],
    projects: [
      {
        id: 'p1',
        name: 'Project 1',
        groupId: 'group-a',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/p1/',
      },
      {
        id: 'p2',
        name: 'Project 2',
        groupId: 'group-a',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/p2/',
      },
      {
        id: 'p3',
        name: 'Project 3',
        groupId: 'group-b',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/p3/',
      },
      {
        id: 'p4',
        name: 'Project 4',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/p4/',
      },
    ],
  };
}

test('generateGroupId generates sequential group IDs and skips existing ones', () => {
  expect(generateGroupId([])).toBe('group');
  expect(generateGroupId(['group'])).toBe('group-2');
  expect(generateGroupId(['group', 'group-2'])).toBe('group-3');
  expect(generateGroupId(['group', 'group-3'])).toBe('group-2');
  expect(generateGroupId(new Set(['group', 'group-2', 'group-3']))).toBe('group-4');
});

test('createProjectGroup adds group immutably with default name', () => {
  const doc = createSampleDocument();
  const result = createProjectGroup(doc);
  expect(result).not.toBeNull();
  expect(result?.groupId).toBe('group');
  expect(result?.document.projectGroups?.length).toBe(3);
  expect(result?.document.projectGroups?.[2]).toEqual({ id: 'group', name: 'New Group' });

  // Original document unchanged
  expect(doc.projectGroups?.length).toBe(2);
});

test('createProjectGroup trims custom name and increments id on collisions', () => {
  const doc: ProjectConfigDocumentV1 = {
    ...createSampleDocument(),
    projectGroups: [{ id: 'group', name: 'Existing Group' }],
  };
  const result = createProjectGroup(doc, '   Custom Team Name   ');
  expect(result).not.toBeNull();
  expect(result?.groupId).toBe('group-2');
  expect(result?.document.projectGroups?.[1]?.name).toBe('Custom Team Name');
});

test('createProjectGroup returns null when reaching 50 groups limit', () => {
  const groups = Array.from({ length: 50 }, (_, i) => ({
    id: `group-${i + 1}`,
    name: `Group ${i + 1}`,
  }));
  const fullDoc: ProjectConfigDocumentV1 = {
    ...createSampleDocument(),
    projectGroups: groups,
  };
  const result = createProjectGroup(fullDoc);
  expect(result).toBeNull();
});

test('renameProjectGroup updates name immutably and trims input', () => {
  const doc = createSampleDocument();
  const updated = renameProjectGroup(doc, 'group-a', '   Renamed Group A   ');
  expect(updated).not.toBe(doc);
  expect(updated.projectGroups?.[0]?.name).toBe('Renamed Group A');
  expect(doc.projectGroups?.[0]?.name).toBe('Group A');
});

test('renameProjectGroup is a no-op when name is identical or empty', () => {
  const doc = createSampleDocument();
  expect(renameProjectGroup(doc, 'group-a', 'Group A')).toBe(doc);
  expect(renameProjectGroup(doc, 'group-a', '   ')).toBe(doc);
  expect(renameProjectGroup(doc, 'group-a', '')).toBe(doc);
  expect(renameProjectGroup(doc, 'nonexistent', 'New Name')).toBe(doc);
});

test('deleteProjectGroup removes group and ungroups its members without affecting other groups', () => {
  const doc = createSampleDocument();
  const updated = deleteProjectGroup(doc, 'group-a');

  expect(updated).not.toBe(doc);
  expect(updated.projectGroups?.map((g) => g.id)).toEqual(['group-b']);

  // p1 and p2 were in group-a, now ungrouped
  expect(updated.projects.find((p) => p.id === 'p1')?.groupId).toBeUndefined();
  expect(updated.projects.find((p) => p.id === 'p2')?.groupId).toBeUndefined();

  // p3 was in group-b, remains in group-b
  expect(updated.projects.find((p) => p.id === 'p3')?.groupId).toBe('group-b');

  // p4 was ungrouped, remains ungrouped
  expect(updated.projects.find((p) => p.id === 'p4')?.groupId).toBeUndefined();

  // All project metadata and order preserved
  expect(updated.projects.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  expect(updated.projects.find((p) => p.id === 'p1')?.name).toBe('Project 1');
  expect(updated.projects.find((p) => p.id === 'p1')?.loginUrl).toBe('https://jenkins.example/login');

  // Original document untouched
  expect(doc.projectGroups?.length).toBe(2);
  expect(doc.projects[0]?.groupId).toBe('group-a');
});

test('deleteProjectGroup is a no-op when group does not exist', () => {
  const doc = createSampleDocument();
  expect(deleteProjectGroup(doc, 'nonexistent')).toBe(doc);
});

test('replaceGroupMembership atomically moves projects and clears unchecked target members', () => {
  const doc = createSampleDocument();
  // Initially: p1 -> group-a, p2 -> group-a, p3 -> group-b, p4 -> ungrouped
  // Replace membership for group-a with [p1, p4] (p2 unchecked, p4 added)
  const updated = replaceGroupMembership(doc, 'group-a', ['p1', 'p4']);

  expect(updated).not.toBe(doc);
  const byId = Object.fromEntries(updated.projects.map((p) => [p.id, p]));

  expect(byId['p1']?.groupId).toBe('group-a');
  expect(byId['p2']?.groupId).toBeUndefined(); // Cleared from group-a
  expect(byId['p3']?.groupId).toBe('group-b'); // Unrelated group untouched
  expect(byId['p4']?.groupId).toBe('group-a'); // Moved into group-a

  // Project order preserved
  expect(updated.projects.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
});

test('replaceGroupMembership moves project from another group into target', () => {
  const doc = createSampleDocument();
  // Move p3 (from group-b) into group-a
  const updated = replaceGroupMembership(doc, 'group-a', ['p1', 'p2', 'p3']);

  const byId = Object.fromEntries(updated.projects.map((p) => [p.id, p]));
  expect(byId['p1']?.groupId).toBe('group-a');
  expect(byId['p2']?.groupId).toBe('group-a');
  expect(byId['p3']?.groupId).toBe('group-a'); // Moved from group-b to group-a
  expect(byId['p4']?.groupId).toBeUndefined();
});

test('replaceGroupMembership returns exact document reference when membership is unchanged', () => {
  const doc = createSampleDocument();
  // Current group-a members are p1 and p2
  const updated = replaceGroupMembership(doc, 'group-a', ['p1', 'p2']);
  expect(updated).toBe(doc);
});

test('replaceGroupMembership rejects nonexistent target group or nonexistent project id without mutation', () => {
  const doc = createSampleDocument();
  // Target group nonexistent
  expect(replaceGroupMembership(doc, 'nonexistent', ['p1'])).toBe(doc);

  // Nonexistent project id
  expect(replaceGroupMembership(doc, 'group-a', ['p1', 'nonexistent-project'])).toBe(doc);
});

test('getGroupProjects filters correctly by group id and ungrouped', () => {
  const doc = createSampleDocument();
  expect(getGroupProjects(doc, 'group-a').map((p) => p.id)).toEqual(['p1', 'p2']);
  expect(getGroupProjects(doc, 'group-b').map((p) => p.id)).toEqual(['p3']);
  expect(getGroupProjects(doc, undefined).map((p) => p.id)).toEqual(['p4']);
  expect(getGroupProjects(doc, null).map((p) => p.id)).toEqual(['p4']);
  expect(getGroupProjects(doc, '').map((p) => p.id)).toEqual(['p4']);
});
