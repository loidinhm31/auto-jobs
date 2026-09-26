import { expect, test } from '@playwright/test';
import React from 'react';

import type { ProjectCardData } from '../../src/reporting/control-page/types/component-contracts.js';
import type {
  ProjectConfigDocumentV1,
  ProjectGroupInput,
} from '../../src/reporting/control-page/types/index.js';
import { buildProjectGroupColumns } from '../../src/reporting/control-page/utils/project-group-board.js';
import { useConfigDocumentEditor } from '../../src/reporting/control-page/hooks/useConfigDocumentEditor.js';

interface HookRunner<T> {
  readonly current: T;
  rerender: () => void;
}

type ReactInternalsContainer = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
    H: Record<string, unknown>;
  };
};

function createHookRunner<T>(hookFn: () => T): HookRunner<T> {
  const states: unknown[] = [];
  let stateIndex = 0;
  const result: { current?: T } = {};

  const reactWithInternals = React as unknown as ReactInternalsContainer;
  const internals =
    reactWithInternals.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const originalDispatcher = internals.H;

  function rerender() {
    stateIndex = 0;
    internals.H = {
      useState(initial: unknown) {
        const idx = stateIndex++;
        if (states.length <= idx) {
          states.push(
            typeof initial === 'function' ? (initial as () => unknown)() : initial,
          );
        }
        const setState = (action: unknown) => {
          states[idx] =
            typeof action === 'function'
              ? (action as (prev: unknown) => unknown)(states[idx])
              : action;
        };
        return [states[idx], setState];
      },
      useCallback(fn: unknown) {
        return fn;
      },
      useMemo(fn: () => unknown) {
        return fn();
      },
      useRef(initial: unknown) {
        const idx = stateIndex++;
        if (states.length <= idx) {
          states.push({ current: initial });
        }
        return states[idx] as { current: unknown };
      },
      useEffect() {},
    };

    try {
      result.current = hookFn();
    } finally {
      internals.H = originalDispatcher;
    }
  }

  rerender();
  return {
    get current() {
      return result.current as T;
    },
    rerender,
  };
}

const projectAlpha: ProjectCardData = {
  id: 'proj-alpha',
  name: 'Alpha Service',
  loginUrl: 'https://jenkins.example.com/login',
  jobUrl: 'https://jenkins.example.com/job/alpha',
  runType: 'report',
  enabled: true,
  groupId: 'group-core',
};

const projectBeta: ProjectCardData = {
  id: 'proj-beta',
  name: 'Beta Service',
  loginUrl: 'https://jenkins.example.com/login',
  jobUrl: 'https://jenkins.example.com/job/beta',
  runType: 'auto-build',
  enabled: false,
  groupId: 'group-core',
};

const projectGamma: ProjectCardData = {
  id: 'proj-gamma',
  name: 'Gamma Service',
  loginUrl: 'https://jenkins.example.com/login',
  jobUrl: 'https://jenkins.example.com/job/gamma',
  runType: 'report',
  enabled: true,
  groupId: 'group-infra',
};

const projectDelta: ProjectCardData = {
  id: 'proj-delta',
  name: 'Delta Service',
  loginUrl: 'https://jenkins.example.com/login',
  jobUrl: '',
  runType: 'report',
  enabled: true,
};

const projectOrphan: ProjectCardData = {
  id: 'proj-orphan',
  name: 'Orphan Service',
  loginUrl: 'https://jenkins.example.com/login',
  jobUrl: 'https://jenkins.example.com/job/orphan',
  runType: 'report',
  enabled: true,
  groupId: 'dangling-non-existent-group',
};

const mockProjects: readonly ProjectCardData[] = [
  projectAlpha,
  projectBeta,
  projectGamma,
  projectDelta,
  projectOrphan,
];

const mockGroups: readonly ProjectGroupInput[] = [
  { id: 'group-core', name: 'Core Platform' },
  { id: 'group-infra', name: 'Infrastructure' },
  { id: 'group-empty', name: 'Empty Team' },
];

test.describe('Phase 02: Compact grouped project board unit tests', () => {
  test.describe('buildProjectGroupColumns bucketing invariants', () => {
    test('renders Ungrouped first and preserves root group order', () => {
      const columns = buildProjectGroupColumns(mockProjects, mockGroups);

      expect(columns.length).toBe(4);
      expect(columns[0]?.groupId).toBeNull();
      expect(columns[0]?.groupName).toBe('Ungrouped');

      expect(columns[1]?.groupId).toBe('group-core');
      expect(columns[1]?.groupName).toBe('Core Platform');

      expect(columns[2]?.groupId).toBe('group-infra');
      expect(columns[2]?.groupName).toBe('Infrastructure');

      expect(columns[3]?.groupId).toBe('group-empty');
      expect(columns[3]?.groupName).toBe('Empty Team');
    });

    test('routes unknown/dangling group IDs to Ungrouped so no project disappears', () => {
      const columns = buildProjectGroupColumns(mockProjects, mockGroups);
      const ungroupedCol = columns[0];
      expect(ungroupedCol).toBeDefined();

      const ungroupedIds = ungroupedCol!.projects.map((p) => p.id);
      expect(ungroupedIds).toContain('proj-delta');
      expect(ungroupedIds).toContain('proj-orphan');
    });

    test('preserves project ordering within each group bucket', () => {
      const columns = buildProjectGroupColumns(mockProjects, mockGroups);
      const coreCol = columns[1];
      expect(coreCol).toBeDefined();

      const coreIds = coreCol!.projects.map((p) => p.id);
      expect(coreIds).toEqual(['proj-alpha', 'proj-beta']);
    });

    test('handles empty groups alongside populated groups', () => {
      const columns = buildProjectGroupColumns(mockProjects, mockGroups);
      const emptyCol = columns[3];
      expect(emptyCol).toBeDefined();
      expect(emptyCol?.projects).toEqual([]);
    });

    test('handles completely empty state (0 projects, 0 groups) with Ungrouped column', () => {
      const columns = buildProjectGroupColumns([], []);
      expect(columns.length).toBe(1);
      expect(columns[0]?.groupId).toBeNull();
      expect(columns[0]?.groupName).toBe('Ungrouped');
      expect(columns[0]?.projects).toEqual([]);
    });

    test('ensures every project appears exactly once across all columns', () => {
      const columns = buildProjectGroupColumns(mockProjects, mockGroups);
      const allAppearedProjects: string[] = [];

      for (const col of columns) {
        for (const proj of col.projects) {
          allAppearedProjects.push(proj.id);
        }
      }

      expect(allAppearedProjects.length).toBe(mockProjects.length);
      const uniqueIds = new Set(allAppearedProjects);
      expect(uniqueIds.size).toBe(mockProjects.length);
      for (const p of mockProjects) {
        expect(uniqueIds.has(p.id)).toBe(true);
      }
    });

    test('handles all projects ungrouped when groups list is empty', () => {
      const columns = buildProjectGroupColumns(mockProjects, []);
      expect(columns.length).toBe(1);
      expect(columns[0]?.groupId).toBeNull();
      expect(columns[0]?.projects.length).toBe(mockProjects.length);
    });

    test('handles project reassignment correctly in bucket reconstruction', () => {
      const reassignedProjects: ProjectCardData[] = [
        { ...projectAlpha, groupId: 'group-infra' },
        { ...projectBeta, groupId: undefined },
        { ...projectGamma, groupId: 'group-core' },
      ];

      const columns = buildProjectGroupColumns(reassignedProjects, mockGroups);
      const ungroupedCol = columns[0]!;
      const coreCol = columns[1]!;
      const infraCol = columns[2]!;

      expect(ungroupedCol.projects.map((p) => p.id)).toEqual(['proj-beta']);
      expect(coreCol.projects.map((p) => p.id)).toEqual(['proj-gamma']);
      expect(infraCol.projects.map((p) => p.id)).toEqual(['proj-alpha']);
    });
  });

  test.describe('useConfigDocumentEditor group lifecycle and replacement revision', () => {
    function sampleDoc(): ProjectConfigDocumentV1 {
      return {
        schemaVersion: 1,
        projectGroups: [
          { id: 'group-core', name: 'Core Platform' },
          { id: 'group-infra', name: 'Infrastructure' },
        ],
        projects: [
          {
            id: 'proj-1',
            name: 'Service 1',
            groupId: 'group-core',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/1',
          },
          {
            id: 'proj-2',
            name: 'Service 2',
            groupId: 'group-core',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/2',
          },
          {
            id: 'proj-3',
            name: 'Service 3',
            groupId: 'group-infra',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/3',
          },
        ],
      };
    }

    test('createGroup creates group immutably and does not alter replacementRevision', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.setDocument(sampleDoc(), false);
      runner.rerender();

      const revBefore = runner.current.replacementRevision;
      const createdId = runner.current.createGroup('New Team');
      runner.rerender();

      expect(createdId).toBe('group');
      expect(runner.current.currentDoc?.projectGroups).toHaveLength(3);
      expect(runner.current.currentDoc?.projectGroups?.[2]?.name).toBe('New Team');
      expect(runner.current.replacementRevision).toBe(revBefore);
      expect(runner.current.isDirty).toBe(true);
    });

    test('renameGroup updates name immutably and preserves group id and project assignments', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.setDocument(sampleDoc(), false);
      runner.rerender();

      runner.current.renameGroup('group-core', 'Core Services Updated');
      runner.rerender();

      const updatedGroup = runner.current.currentDoc?.projectGroups?.find(
        (g) => g.id === 'group-core',
      );
      expect(updatedGroup?.name).toBe('Core Services Updated');

      // Verify projects still assigned to group-core
      const assigned = runner.current.currentDoc?.projects.filter(
        (p) => p.groupId === 'group-core',
      );
      expect(assigned).toHaveLength(2);
    });

    test('deleteGroup removes group definition and ungroups its member projects to Ungrouped', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.setDocument(sampleDoc(), false);
      runner.rerender();

      runner.current.deleteGroup('group-core');
      runner.rerender();

      expect(runner.current.currentDoc?.projectGroups).toHaveLength(1);
      expect(runner.current.currentDoc?.projectGroups?.[0]?.id).toBe('group-infra');

      // Projects 1 and 2 must have groupId removed (ungrouped)
      const p1 = runner.current.currentDoc?.projects.find((p) => p.id === 'proj-1');
      const p2 = runner.current.currentDoc?.projects.find((p) => p.id === 'proj-2');
      const p3 = runner.current.currentDoc?.projects.find((p) => p.id === 'proj-3');

      expect(p1?.groupId).toBeUndefined();
      expect(p2?.groupId).toBeUndefined();
      expect(p3?.groupId).toBe('group-infra');
    });

    test('setGroupMembership atomically moves checked projects and ungroups unchecked ones', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.setDocument(sampleDoc(), false);
      runner.rerender();

      // Move proj-3 into group-core, remove proj-2 from group-core
      runner.current.setGroupMembership('group-core', ['proj-1', 'proj-3']);
      runner.rerender();

      const p1 = runner.current.currentDoc?.projects.find((p) => p.id === 'proj-1');
      const p2 = runner.current.currentDoc?.projects.find((p) => p.id === 'proj-2');
      const p3 = runner.current.currentDoc?.projects.find((p) => p.id === 'proj-3');

      expect(p1?.groupId).toBe('group-core');
      expect(p2?.groupId).toBeUndefined(); // moved out of group-core -> Ungrouped
      expect(p3?.groupId).toBe('group-core'); // moved from group-infra -> group-core
    });

    test('replaceDocument increments replacementRevision to signal dialog reset', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.setDocument(sampleDoc(), false);
      runner.rerender();

      const rev1 = runner.current.replacementRevision;
      runner.current.replaceDocument(sampleDoc());
      runner.rerender();

      const rev2 = runner.current.replacementRevision;
      expect(rev2).toBe(rev1 + 1);
    });
  });
});
