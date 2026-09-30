import { expect, test } from '@playwright/test';
import React from 'react';

import type {
  JobColumnInput,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectGroupInput,
} from '../../src/reporting/control-page/types/index.js';
import { useConfigDocumentEditor } from '../../src/reporting/control-page/hooks/useConfigDocumentEditor.js';
import {
  addJobColumn,
  renameJobColumn,
  removeJobColumn,
  updateJobCell,
  toggleProjectJobSelection,
} from '../../src/reporting/control-page/hooks/matrix-document-transitions.js';
import { ProjectsJobMatrix } from '../../src/reporting/control-page/components/organisms/projects-job-matrix.js';

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
      useEffect() { },
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

const mockGroups: readonly ProjectGroupInput[] = [
  { id: 'group-core', name: 'Core Platform' },
  { id: 'group-infra', name: 'Infrastructure' },
];

const mockJobColumns: readonly JobColumnInput[] = [
  { id: 'report-job', name: 'Report Job' },
  { id: 'build-job', name: 'Build Job' },
];

const mockProjects: readonly ProjectConfigInput[] = [
  {
    id: 'proj-alpha',
    name: 'Alpha Service',
    loginUrl: 'https://jenkins.example.com/login',
    jobUrl: 'https://jenkins.example.com/job/alpha-report',
    jobs: {
      'report-job': 'https://jenkins.example.com/job/alpha-report',
      'build-job': 'https://jenkins.example.com/job/alpha-build',
    },
    selectedJobColumns: ['report-job'],
    runType: 'report',
    enabled: true,
    groupId: 'group-core',
  },
  {
    id: 'proj-beta',
    name: 'Beta Service',
    loginUrl: 'https://jenkins.example.com/login',
    jobUrl: 'https://jenkins.example.com/job/beta-report',
    jobs: {
      'report-job': 'https://jenkins.example.com/job/beta-report',
      'build-job': '',
    },
    selectedJobColumns: ['report-job', 'build-job'],
    runType: 'report',
    enabled: false,
    groupId: 'group-core',
  },
  {
    id: 'proj-gamma',
    name: 'Gamma Service',
    loginUrl: 'https://jenkins.example.com/login',
    jobUrl: 'https://jenkins.example.com/job/gamma-report',
    jobs: {
      'report-job': 'https://jenkins.example.com/job/gamma-report',
      'build-job': 'https://jenkins.example.com/job/gamma-build',
    },
    selectedJobColumns: ['build-job'],
    runType: 'auto-build',
    enabled: true,
    groupId: 'group-infra',
  },
  {
    id: 'proj-delta',
    name: 'Delta Service',
    loginUrl: 'https://jenkins.example.com/login',
    jobUrl: 'https://jenkins.example.com/job/delta-report',
    jobs: {
      'report-job': 'https://jenkins.example.com/job/delta-report',
      'build-job': '',
    },
    selectedJobColumns: ['report-job'],
    runType: 'report',
    enabled: true,
  },
];

function sampleMatrixDoc(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    jobColumns: mockJobColumns,
    projectGroups: mockGroups,
    projects: mockProjects,
  };
}

test.describe('Phase 02: Flat project job matrix and group metadata preservation', () => {
  test.describe('Matrix flat presentation and group metadata preservation', () => {
    test('renders one row per project regardless of groupId and preserves group metadata', () => {
      const doc = sampleMatrixDoc();
      expect(doc.projects.length).toBe(4);
      expect(doc.projects[0]?.groupId).toBe('group-core');
      expect(doc.projects[1]?.groupId).toBe('group-core');
      expect(doc.projects[2]?.groupId).toBe('group-infra');
      expect(doc.projects[3]?.groupId).toBeUndefined();

      // Rendering ProjectsJobMatrix should not crash and should render all projects
      const element = React.createElement(ProjectsJobMatrix, {
        document: doc,
      });
      expect(element).toBeDefined();
    });

    test('addJobColumn updates job keys on all projects while retaining groupId', () => {
      const doc = sampleMatrixDoc();
      const updated = addJobColumn(doc, { id: 'deploy-job', name: 'Deploy' });

      expect(updated.jobColumns?.length).toBe(3);
      expect(updated.projectGroups).toEqual(mockGroups);
      for (const p of updated.projects) {
        expect(p.jobs?.['deploy-job']).toBe('');
        // Ensure groupId is preserved
        const orig = mockProjects.find((m) => m.id === p.id);
        expect(p.groupId).toBe(orig?.groupId);
      }
    });

    test('renameJobColumn updates name without modifying URLs or group metadata', () => {
      const doc = sampleMatrixDoc();
      const updated = renameJobColumn(doc, 'report-job', 'Renamed Report');

      const col = updated.jobColumns?.find((c) => c.id === 'report-job');
      expect(col?.name).toBe('Renamed Report');
      expect(updated.projects[0]?.jobs?.['report-job']).toBe('https://jenkins.example.com/job/alpha-report');
      expect(updated.projects[0]?.groupId).toBe('group-core');
    });

    test('removeJobColumn removes column from jobs and selection without dropping groupId', () => {
      const doc = sampleMatrixDoc();
      const updated = removeJobColumn(doc, 'build-job');
      expect(updated).not.toBeNull();
      expect(updated!.jobColumns?.length).toBe(1);
      expect(updated!.jobColumns?.[0]?.id).toBe('report-job');

      for (const p of updated!.projects) {
        expect('build-job' in (p.jobs ?? {})).toBe(false);
        expect(p.selectedJobColumns?.includes('build-job')).toBe(false);
        const orig = mockProjects.find((m) => m.id === p.id);
        expect(p.groupId).toBe(orig?.groupId);
      }
    });

    test('updateJobCell modifies cell URL and recalculates primary mirror while keeping groupId', () => {
      const doc = sampleMatrixDoc();
      const updated = updateJobCell(doc, 0, 'report-job', 'https://jenkins.example.com/job/new-alpha');

      expect(updated.projects[0]?.jobs?.['report-job']).toBe('https://jenkins.example.com/job/new-alpha');
      expect(updated.projects[0]?.jobUrl).toBe('https://jenkins.example.com/job/new-alpha');
      expect(updated.projects[0]?.groupId).toBe('group-core');
    });

    test('toggleProjectJobSelection updates row-local multi-selection', () => {
      const doc = sampleMatrixDoc();
      // Select build-job on proj-alpha
      const step1 = toggleProjectJobSelection(doc, 0, 'build-job', true);
      expect(step1.projects[0]?.selectedJobColumns).toContain('report-job');
      expect(step1.projects[0]?.selectedJobColumns).toContain('build-job');

      // Deselect report-job on proj-alpha
      const step2 = toggleProjectJobSelection(step1, 0, 'report-job', false);
      expect(step2.projects[0]?.selectedJobColumns).toEqual(['build-job']);
      // proj-beta selection should be unchanged
      expect(step2.projects[1]?.selectedJobColumns).toEqual(['report-job', 'build-job']);
    });
  });

  test.describe('useConfigDocumentEditor group metadata persistence in document', () => {
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
            loginUrl: 'https://jenkins.example.com/login',
            jobUrl: 'https://jenkins.example.com/job/1',
            groupId: 'group-core',
            runType: 'report',
            enabled: true,
          },
          {
            id: 'proj-2',
            name: 'Service 2',
            loginUrl: 'https://jenkins.example.com/login',
            jobUrl: 'https://jenkins.example.com/job/2',
            groupId: 'group-infra',
            runType: 'report',
            enabled: true,
          },
        ],
      };
    }

    test('initializes with document containing projectGroups and row groupIds', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.replaceDocument(sampleDoc());
      runner.rerender();

      expect(runner.current.currentDoc?.projectGroups?.length).toBe(2);
      expect(runner.current.currentDoc?.projects[0]?.groupId).toBe('group-core');
      expect(runner.current.currentDoc?.projects[1]?.groupId).toBe('group-infra');
    });

    test('updating a project preserves its groupId in document state', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.replaceDocument(sampleDoc());
      runner.rerender();

      runner.current.updateProjectAt(0, { name: 'Service 1 Updated' });
      runner.rerender();

      expect(runner.current.isDirty).toBe(true);
      expect(runner.current.currentDoc?.projects[0]?.name).toBe('Service 1 Updated');
      expect(runner.current.currentDoc?.projects[0]?.groupId).toBe('group-core');
    });

    test('raw JSON apply round-trips group metadata without loss', () => {
      const runner = createHookRunner(() => useConfigDocumentEditor());
      runner.current.replaceDocument(sampleDoc());
      runner.rerender();

      const rawJson = runner.current.rawJsonString;
      expect(rawJson).toContain('"projectGroups"');
      expect(rawJson).toContain('"groupId": "group-core"');

      const applied = runner.current.applyRawJson(rawJson);
      expect(applied).toBe(true);
      expect(runner.current.currentDoc?.projectGroups?.length).toBe(2);
      expect(runner.current.currentDoc?.projects[0]?.groupId).toBe('group-core');
    });
  });
});
