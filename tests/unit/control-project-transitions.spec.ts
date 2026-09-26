import { expect, test } from '@playwright/test';
import { PROJECT_CONFIG_LIMITS } from '../../src/config/project-config-schema.js';
import type {
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../../src/reporting/control-page/types/index.js';
import {
  createProjectGroup,
  deleteProjectGroup,
  generateGroupId,
  getGroupProjects,
  renameProjectGroup,
  replaceGroupMembership,
} from '../../src/reporting/control-page/hooks/project-group-transitions.js';
import {
  CLONE_NAME_SUFFIX,
  MAX_PROJECT_ID_LENGTH,
  cloneProjectDraft,
  generateCloneProjectId,
  generateCloneProjectName,
} from '../../src/reporting/control-page/utils/clone-project-draft.js';

function createDeepSampleDocument(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    defaults: {
      artifactDir: 'artifacts',
      timeoutMs: 30_000,
      browser: 'chromium',
    },
    projectGroups: [
      { id: 'group-alpha', name: 'Alpha Core' },
      { id: 'group-beta', name: 'Beta Services' },
      { id: 'group-empty', name: 'Empty Group' },
    ],
    projects: [
      {
        id: 'svc-alpha-1',
        name: 'Alpha 1 Service',
        groupId: 'group-alpha',
        runType: 'auto-build',
        enabled: true,
        loginUrl: 'https://jenkins.example.com/login',
        jobUrl: 'https://jenkins.example.com/job/alpha-1/',
        waitForCompletion: true,
        waitTimeoutMs: 15_000,
        credentials: {
          usernameVariable: 'ALPHA_USER',
          passwordVariable: 'ALPHA_PASS',
        },
        selectors: {
          authLandmark: { kind: 'css', value: '#auth-box' },
        },
      },
      {
        id: 'svc-alpha-2',
        name: 'Alpha 2 Service',
        groupId: 'group-alpha',
        runType: 'report',
        enabled: false,
        loginUrl: 'https://jenkins.example.com/login',
        jobUrl: 'https://jenkins.example.com/job/alpha-2/',
      },
      {
        id: 'svc-beta-1',
        name: 'Beta 1 Service',
        groupId: 'group-beta',
        runType: 'report',
        enabled: true,
        loginUrl: 'https://jenkins.example.com/login',
        jobUrl: 'https://jenkins.example.com/job/beta-1/',
      },
      {
        id: 'svc-ungrouped-1',
        name: 'Ungrouped 1 Service',
        runType: 'auto-build',
        enabled: true,
        loginUrl: 'https://jenkins.example.com/login',
        jobUrl: 'https://jenkins.example.com/job/ungrouped-1/',
      },
    ],
  };
}

test.describe('Control Project Transitions — Group Membership Invariants', () => {
  test('generateGroupId generates unique progressive IDs skipping conflicts', () => {
    expect(generateGroupId([])).toBe('group');
    expect(generateGroupId(['group'])).toBe('group-2');
    expect(generateGroupId(['group', 'group-2'])).toBe('group-3');
    expect(generateGroupId(new Set(['group', 'group-3']))).toBe('group-2');
  });

  test('replaceGroupMembership moves projects from another group atomically and unchecks to Ungrouped', () => {
    const doc = createDeepSampleDocument();

    // Select svc-beta-1 AND svc-alpha-1 into group-beta.
    // svc-alpha-1 should move from group-alpha to group-beta.
    // svc-beta-1 remains in group-beta.
    const result1 = replaceGroupMembership(doc, 'group-beta', ['svc-beta-1', 'svc-alpha-1']);

    expect(result1.projects.find((p) => p.id === 'svc-alpha-1')?.groupId).toBe('group-beta');
    expect(result1.projects.find((p) => p.id === 'svc-beta-1')?.groupId).toBe('group-beta');
    expect(result1.projects.find((p) => p.id === 'svc-alpha-2')?.groupId).toBe('group-alpha');
    expect(result1.projects.find((p) => p.id === 'svc-ungrouped-1')?.groupId).toBeUndefined();

    // Now uncheck svc-beta-1 from group-beta, leaving only svc-alpha-1.
    // svc-beta-1 should return to Ungrouped (groupId deleted).
    const result2 = replaceGroupMembership(result1, 'group-beta', ['svc-alpha-1']);

    expect(result2.projects.find((p) => p.id === 'svc-alpha-1')?.groupId).toBe('group-beta');
    expect(result2.projects.find((p) => p.id === 'svc-beta-1')?.groupId).toBeUndefined();
    expect(result2.projects.find((p) => p.id === 'svc-beta-1')).not.toHaveProperty('groupId');
  });

  test('replaceGroupMembership strictly preserves project ordering and unrelated nested fields', () => {
    const doc = createDeepSampleDocument();
    const originalOrder = doc.projects.map((p) => p.id);

    // Reorder selection array when passing to replaceGroupMembership
    const result = replaceGroupMembership(doc, 'group-alpha', ['svc-alpha-2', 'svc-alpha-1', 'svc-ungrouped-1']);

    // Order in result.projects MUST match the original document project ordering
    expect(result.projects.map((p) => p.id)).toEqual(originalOrder);

    // Unrelated and nested fields on both modified and unmodified projects are intact
    const alpha1 = result.projects.find((p) => p.id === 'svc-alpha-1');
    expect(alpha1?.waitForCompletion).toBe(true);
    expect(alpha1?.waitTimeoutMs).toBe(15_000);
    expect(alpha1?.credentials).toEqual({
      usernameVariable: 'ALPHA_USER',
      passwordVariable: 'ALPHA_PASS',
    });
    expect(alpha1?.selectors).toEqual({
      authLandmark: { kind: 'css', value: '#auth-box' },
    });
    expect(alpha1?.runType).toBe('auto-build');
    expect(alpha1?.enabled).toBe(true);

    const beta1 = result.projects.find((p) => p.id === 'svc-beta-1');
    expect(beta1?.runType).toBe('report');
    expect(beta1?.loginUrl).toBe('https://jenkins.example.com/login');
  });

  test('replaceGroupMembership preserves input document and objects immutably', () => {
    const doc = createDeepSampleDocument();
    const docSnapshot = JSON.stringify(doc);

    const result = replaceGroupMembership(doc, 'group-alpha', ['svc-alpha-1']);

    expect(JSON.stringify(doc)).toBe(docSnapshot);
    expect(result).not.toBe(doc);
    expect(result.projects).not.toBe(doc.projects);
  });

  test('replaceGroupMembership returns identical document if selection has no net changes or invalid group/ids', () => {
    const doc = createDeepSampleDocument();

    // Exactly current membership of group-alpha
    const noChange = replaceGroupMembership(doc, 'group-alpha', ['svc-alpha-1', 'svc-alpha-2']);
    expect(noChange).toBe(doc);

    // Non-existent target group
    const invalidGroup = replaceGroupMembership(doc, 'non-existent-group', ['svc-alpha-1']);
    expect(invalidGroup).toBe(doc);

    // Unknown project ID in selection
    const invalidProject = replaceGroupMembership(doc, 'group-alpha', ['svc-alpha-1', 'svc-unknown']);
    expect(invalidProject).toBe(doc);
  });

  test('deleteProjectGroup deletes group definition and returns all assigned projects to Ungrouped', () => {
    const doc = createDeepSampleDocument();
    const result = deleteProjectGroup(doc, 'group-alpha');

    expect(result.projectGroups?.some((g) => g.id === 'group-alpha')).toBe(false);
    expect(result.projectGroups?.length).toBe(2);

    // All former alpha projects now have undefined groupId
    const alpha1 = result.projects.find((p) => p.id === 'svc-alpha-1');
    const alpha2 = result.projects.find((p) => p.id === 'svc-alpha-2');
    expect(alpha1?.groupId).toBeUndefined();
    expect(alpha1).not.toHaveProperty('groupId');
    expect(alpha2?.groupId).toBeUndefined();

    // beta-1 and ungrouped-1 are untouched
    expect(result.projects.find((p) => p.id === 'svc-beta-1')?.groupId).toBe('group-beta');
    expect(result.projects.find((p) => p.id === 'svc-ungrouped-1')?.groupId).toBeUndefined();

    // Document project ordering is preserved
    expect(result.projects.map((p) => p.id)).toEqual(doc.projects.map((p) => p.id));
  });

  test('deleteProjectGroup on non-existent group or empty group returns expected document', () => {
    const doc = createDeepSampleDocument();

    // Non-existent group returns identity
    const unchanged = deleteProjectGroup(doc, 'non-existent-group');
    expect(unchanged).toBe(doc);

    // Empty group deletes group definition without touching projects
    const resultEmpty = deleteProjectGroup(doc, 'group-empty');
    expect(resultEmpty.projectGroups?.some((g) => g.id === 'group-empty')).toBe(false);
    expect(resultEmpty.projects).toBe(doc.projects);
  });

  test('renameProjectGroup trims name, respects maxNameLength, and preserves document when invalid', () => {
    const doc = createDeepSampleDocument();

    // Valid rename with surrounding whitespace
    const renamed = renameProjectGroup(doc, 'group-alpha', '  Core Platform Service  ');
    expect(renamed.projectGroups?.find((g) => g.id === 'group-alpha')?.name).toBe('Core Platform Service');

    // Max length enforcement
    const longName = 'A'.repeat(300);
    const capped = renameProjectGroup(doc, 'group-alpha', longName);
    expect(capped.projectGroups?.find((g) => g.id === 'group-alpha')?.name.length).toBe(PROJECT_CONFIG_LIMITS.maxNameLength);

    // Empty or same name returns identity
    expect(renameProjectGroup(doc, 'group-alpha', '   ')).toBe(doc);
    expect(renameProjectGroup(doc, 'group-alpha', 'Alpha Core')).toBe(doc);
    expect(renameProjectGroup(doc, 'non-existent', 'New Name')).toBe(doc);
  });

  test('getGroupProjects accurately partitions projects into groups and Ungrouped', () => {
    const doc = createDeepSampleDocument();

    const alphaProjects = getGroupProjects(doc, 'group-alpha');
    expect(alphaProjects.map((p) => p.id)).toEqual(['svc-alpha-1', 'svc-alpha-2']);

    const betaProjects = getGroupProjects(doc, 'group-beta');
    expect(betaProjects.map((p) => p.id)).toEqual(['svc-beta-1']);

    const emptyProjects = getGroupProjects(doc, 'group-empty');
    expect(emptyProjects).toEqual([]);

    // Ungrouped via null, undefined, or empty string
    expect(getGroupProjects(doc, null).map((p) => p.id)).toEqual(['svc-ungrouped-1']);
    expect(getGroupProjects(doc, undefined).map((p) => p.id)).toEqual(['svc-ungrouped-1']);
    expect(getGroupProjects(doc, '').map((p) => p.id)).toEqual(['svc-ungrouped-1']);
  });

  test('createProjectGroup generates unique group IDs and enforces maxGroups limit', () => {
    const doc = createDeepSampleDocument();

    const created = createProjectGroup(doc, 'New Team');
    expect(created).not.toBeNull();
    expect(created?.groupId).toBe('group');
    expect(created?.document.projectGroups?.length).toBe(4);

    // Fill up to maxGroups
    let currentDoc = doc;
    while ((currentDoc.projectGroups?.length ?? 0) < PROJECT_CONFIG_LIMITS.maxGroups) {
      const res = createProjectGroup(currentDoc);
      expect(res).not.toBeNull();
      currentDoc = res!.document;
    }

    expect(currentDoc.projectGroups?.length).toBe(PROJECT_CONFIG_LIMITS.maxGroups);

    // Exceeding maxGroups returns null
    const overflow = createProjectGroup(currentDoc, 'Overflow Group');
    expect(overflow).toBeNull();
  });
});

test.describe('Control Project Transitions — Clone Identity and Independence Invariants', () => {
  test('generateCloneProjectId respects MAX_PROJECT_ID_LENGTH with suffix-aware truncation', () => {
    // 63-character base ID
    const longId = 'a'.repeat(63);
    const cloneId = generateCloneProjectId(longId, []);

    expect(cloneId.length).toBeLessThanOrEqual(MAX_PROJECT_ID_LENGTH);
    expect(cloneId).toBe(`${'a'.repeat(63 - '-copy'.length)}-copy`);
    expect(cloneId.length).toBe(63);

    // Sequential collision resolution with long base
    const existing = new Set([cloneId]);
    const cloneId2 = generateCloneProjectId(longId, existing);
    expect(cloneId2.length).toBeLessThanOrEqual(MAX_PROJECT_ID_LENGTH);
    expect(cloneId2).toBe(`${'a'.repeat(63 - '-copy-2'.length)}-copy-2`);
    expect(cloneId2.length).toBe(63);

    // High counter collision resolution
    for (let i = 2; i <= 15; i += 1) {
      existing.add(`${'a'.repeat(63 - `-copy-${i}`.length)}-copy-${i}`);
    }
    const cloneId16 = generateCloneProjectId(longId, existing);
    expect(cloneId16.length).toBeLessThanOrEqual(MAX_PROJECT_ID_LENGTH);
    expect(cloneId16).toBe(`${'a'.repeat(63 - '-copy-16'.length)}-copy-16`);
    expect(cloneId16.length).toBe(63);
  });

  test('generateCloneProjectId normalizes uppercase and special characters safely', () => {
    const messyId = '---My_Service#99/Prod---';
    const cloneId = generateCloneProjectId(messyId, []);
    expect(cloneId).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(cloneId).toBe('my-service-99-prod-copy');
  });

  test('generateCloneProjectName caps name at maxNameLength including (copy) suffix', () => {
    const sourceName = 'B'.repeat(300);
    const cloneName = generateCloneProjectName(sourceName);
    expect(cloneName.length).toBe(PROJECT_CONFIG_LIMITS.maxNameLength);
    expect(cloneName.endsWith(CLONE_NAME_SUFFIX)).toBe(true);
  });

  test('cloneProjectDraft produces deep clone with disabled and ungrouped state', () => {
    const doc = createDeepSampleDocument();
    const sourceProject = doc.projects[0]!; // svc-alpha-1 (has credentials, snyk, enabled: true, groupId: 'group-alpha')

    const clone = cloneProjectDraft(sourceProject, doc.projects);

    // Invariant 1: unique identity
    expect(clone.id).toBe('svc-alpha-1-copy');
    expect(clone.name).toBe('Alpha 1 Service (copy)');

    // Invariant 2: disabled by default
    expect(clone.enabled).toBe(false);

    // Invariant 3: ungrouped (no groupId property)
    expect(clone.groupId).toBeUndefined();
    expect(clone).not.toHaveProperty('groupId');

    // Invariant 4: URLs, runType, completion settings preserved verbatim
    expect(clone.runType).toBe('auto-build');
    expect(clone.loginUrl).toBe(sourceProject.loginUrl);
    expect(clone.jobUrl).toBe(sourceProject.jobUrl);
    expect(clone.waitForCompletion).toBe(sourceProject.waitForCompletion);
    expect(clone.waitTimeoutMs).toBe(sourceProject.waitTimeoutMs);

    // Invariant 5: Deep mutation independence
    expect(clone.credentials).toEqual(sourceProject.credentials);
    expect(clone.credentials).not.toBe(sourceProject.credentials);
    expect(clone.selectors).toEqual(sourceProject.selectors);
    expect(clone.selectors).not.toBe(sourceProject.selectors);

    // Modifying clone nested object does NOT affect source
    clone.credentials!.usernameVariable = 'STAGING_USER';
    expect(sourceProject.credentials?.usernameVariable).toBe('ALPHA_USER');

    // Modifying source nested object does NOT affect clone
    sourceProject.selectors!.authLandmark = { kind: 'css', value: '#new-landmark' };
    expect(clone.selectors?.authLandmark).toEqual({ kind: 'css', value: '#auth-box' });
  });

  test('cloneProjectDraft preserves absent inherited defaults without injecting synthetic values', () => {
    const minimalProject: ProjectConfigInput = {
      id: 'minimal-svc',
      name: 'Minimal Service',
      runType: 'report',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/minimal/',
    };

    const clone = cloneProjectDraft(minimalProject, [minimalProject]);

    expect(clone).not.toHaveProperty('timeoutMs');
    expect(clone).not.toHaveProperty('browser');
    expect(clone).not.toHaveProperty('artifactDir');
    expect(clone).not.toHaveProperty('waitForCompletion');
    expect(clone).not.toHaveProperty('waitTimeoutMs');
    expect(clone).not.toHaveProperty('selectors');
    expect(clone).not.toHaveProperty('sonarqube');
    expect(clone).not.toHaveProperty('credentials');
    expect(clone).not.toHaveProperty('groupId');
  });
});
