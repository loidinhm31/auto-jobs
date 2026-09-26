import { expect, test } from '@playwright/test';
import React from 'react';
import type { ProjectConfigDocumentV1 } from '../../src/reporting/control-page/types/index.js';
import { useConfigDocumentEditor } from '../../src/reporting/control-page/hooks/useConfigDocumentEditor.js';
import { useConfigManager } from '../../src/reporting/control-page/hooks/useConfigManager.js';
import type { UseControlApiResult } from '../../src/reporting/control-page/hooks/useControlApi.js';

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
        return { current: initial };
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
      return result.current!;
    },
    rerender,
  };
}

function sampleDocument(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    projects: [
      {
        id: 'p1',
        name: 'Project 1',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/p1/',
      },
      {
        id: 'p2',
        name: 'Project 2',
        loginUrl: 'https://jenkins.example/login',
        jobUrl: 'https://jenkins.example/job/p2/',
      },
    ],
  };
}

test.describe('useConfigDocumentEditor - group transitions & replacement revision', () => {
  test('initial state has replacementRevision 0 and isClean', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    expect(runner.current.replacementRevision).toBe(0);
    expect(runner.current.currentDoc).toBeNull();
    expect(runner.current.isDirty).toBe(false);
  });

  test('replaceDocument increments replacementRevision, resets dirty flag, and updates document', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(sampleDocument());
    runner.rerender();

    expect(runner.current.replacementRevision).toBe(1);
    expect(runner.current.isDirty).toBe(false);
    expect(runner.current.currentDoc?.projects.length).toBe(2);
    expect(runner.current.rawJsonString).toContain('Project 1');
  });

  test('createGroup creates group, marks dirty, does NOT increment replacementRevision', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(sampleDocument());
    runner.rerender();
    expect(runner.current.replacementRevision).toBe(1);

    const groupId = runner.current.createGroup('Frontend Team');
    runner.rerender();

    expect(groupId).toBe('group');
    expect(runner.current.isDirty).toBe(true);
    expect(runner.current.replacementRevision).toBe(1);
    expect(runner.current.currentDoc?.projectGroups).toEqual([
      { id: 'group', name: 'Frontend Team' },
    ]);
  });

  test('renameGroup renames group, marks dirty, does NOT increment replacementRevision', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(sampleDocument());
    runner.rerender();

    const groupId = runner.current.createGroup('Initial Name');
    runner.rerender();
    expect(runner.current.replacementRevision).toBe(1);

    runner.current.renameGroup(groupId!, 'Renamed Group');
    runner.rerender();

    expect(runner.current.replacementRevision).toBe(1);
    expect(runner.current.isDirty).toBe(true);
    expect(runner.current.currentDoc?.projectGroups?.[0]?.name).toBe('Renamed Group');
  });

  test('renameGroup with no changes does NOT mark a clean document dirty', () => {
    const docWithGroup: ProjectConfigDocumentV1 = {
      ...sampleDocument(),
      projectGroups: [{ id: 'group', name: 'Existing Group' }],
    };
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(docWithGroup);
    runner.rerender();
    expect(runner.current.isDirty).toBe(false);

    runner.current.renameGroup('group', 'Existing Group');
    runner.rerender();
    expect(runner.current.isDirty).toBe(false);
  });

  test('deleteGroup deletes group and ungroups members, does NOT increment replacementRevision', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(sampleDocument());
    runner.rerender();

    const groupId = runner.current.createGroup('Ops');
    runner.rerender();
    runner.current.setGroupMembership(groupId!, ['p1']);
    runner.rerender();
    expect(runner.current.currentDoc?.projects[0]?.groupId).toBe('group');

    runner.current.deleteGroup(groupId!);
    runner.rerender();

    expect(runner.current.replacementRevision).toBe(1);
    expect(runner.current.isDirty).toBe(true);
    expect(runner.current.currentDoc?.projectGroups?.length).toBe(0);
    expect(runner.current.currentDoc?.projects[0]?.groupId).toBeUndefined();
  });

  test('setGroupMembership moves projects and clears unchecked target members', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(sampleDocument());
    runner.rerender();

    const g1 = runner.current.createGroup('Group 1')!;
    runner.rerender();

    runner.current.setGroupMembership(g1, ['p1']);
    runner.rerender();
    expect(runner.current.currentDoc?.projects.find((p) => p.id === 'p1')?.groupId).toBe(g1);
    expect(runner.current.currentDoc?.projects.find((p) => p.id === 'p2')?.groupId).toBeUndefined();

    runner.current.setGroupMembership(g1, ['p2']);
    runner.rerender();
    expect(runner.current.currentDoc?.projects.find((p) => p.id === 'p1')?.groupId).toBeUndefined();
    expect(runner.current.currentDoc?.projects.find((p) => p.id === 'p2')?.groupId).toBe(g1);
    expect(runner.current.replacementRevision).toBe(1);
  });

  test('applyRawJson increments replacementRevision on success, does NOT increment on error', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(sampleDocument());
    runner.rerender();
    expect(runner.current.replacementRevision).toBe(1);

    const validRaw = JSON.stringify({
      schemaVersion: 1,
      projectGroups: [{ id: 'core', name: 'Core' }],
      projects: [
        {
          id: 'svc-3',
          name: 'Service 3',
          groupId: 'core',
          loginUrl: 'https://jenkins.example/login',
          jobUrl: 'https://jenkins.example/job/svc-3/',
        },
      ],
    });

    const success = runner.current.applyRawJson(validRaw);
    runner.rerender();

    expect(success).toBe(true);
    expect(runner.current.replacementRevision).toBe(2);
    expect(runner.current.currentDoc?.projects[0]?.id).toBe('svc-3');
    expect(runner.current.isDirty).toBe(true);

    const invalidRaw = JSON.stringify({
      schemaVersion: 2,
      projects: [],
    });

    const failure = runner.current.applyRawJson(invalidRaw);
    runner.rerender();

    expect(failure).toBe(false);
    expect(runner.current.replacementRevision).toBe(2);
    expect(runner.current.currentDoc?.projects[0]?.id).toBe('svc-3');
  });
});

test.describe('useConfigManager - lifecycle and replacement revision', () => {
  function createMockApi(initialDoc = sampleDocument()) {
    let currentSavedDoc = initialDoc;
    let etagCounter = 1;

    const dummyResponse = new Response('{}', { status: 200 });
    const api: UseControlApiResult = {
      csrfToken: 'mock-csrf-token',
      setCsrfToken: () => {},
      apiFetch: async (_url, init) => {
        if (init?.method === 'PUT') {
          currentSavedDoc = JSON.parse(init.body as string) as ProjectConfigDocumentV1;
          etagCounter += 1;
          return new Response(
            JSON.stringify({
              name: 'test-config.json',
              etag: `"etag-${etagCounter}"`,
              document: currentSavedDoc,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 200 });
      },
      requestJson: async <T>(url: string): Promise<{ data: T; response: Response }> => {
        if (url.includes('/api/config?name=')) {
          return {
            data: {
              name: 'test-config.json',
              etag: `"etag-${etagCounter}"`,
              document: currentSavedDoc,
            } as unknown as T,
            response: dummyResponse,
          };
        }
        if (url === '/api/configs') {
          return {
            data: {
              configs: [{ name: 'test-config.json' }],
            } as unknown as T,
            response: dummyResponse,
          };
        }
        return { data: {} as T, response: dummyResponse };
      },
    };

    return { api, getSavedDoc: () => currentSavedDoc };
  }

  test('loadConfig increments replacementRevision; saveConfig does NOT increment replacementRevision', async () => {
    const { api } = createMockApi();
    const runner = createHookRunner(() => useConfigManager(api));
    expect(runner.current.replacementRevision).toBe(0);

    await runner.current.loadConfig('test-config.json');
    runner.rerender();

    expect(runner.current.replacementRevision).toBe(1);
    expect(runner.current.isDirty).toBe(false);
    expect(runner.current.etag).toBe('"etag-1"');

    runner.current.createGroup('New Team');
    runner.rerender();

    expect(runner.current.replacementRevision).toBe(1);
    expect(runner.current.isDirty).toBe(true);

    const saved = await runner.current.saveConfig();
    runner.rerender();

    expect(saved).toBe(true);
    expect(runner.current.isDirty).toBe(false);
    expect(runner.current.etag).toBe('"etag-2"');
    expect(runner.current.replacementRevision).toBe(1);

    await runner.current.reloadConfig();
    runner.rerender();

    expect(runner.current.replacementRevision).toBe(2);
    expect(runner.current.isDirty).toBe(false);
  });

  test('failed loadConfig preserves state and does not increment revision', async () => {
    const failingApi: UseControlApiResult = {
      csrfToken: 'mock-csrf-token',
      setCsrfToken: () => {},
      apiFetch: async () => new Response('{}', { status: 500 }),
      requestJson: async () => {
        throw new Error('Network error');
      },
    };

    const runner = createHookRunner(() => useConfigManager(failingApi));
    expect(runner.current.replacementRevision).toBe(0);

    await runner.current.loadConfig('broken.json');
    runner.rerender();

    expect(runner.current.replacementRevision).toBe(0);
    expect(runner.current.banner?.type).toBe('error');
    expect(runner.current.banner?.message).toContain('Failed to load config');
  });
});
