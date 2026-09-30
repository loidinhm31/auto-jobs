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

  test('applyRawJson expands legacy schema-v1 document into matrix format with default column and selections', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument(sampleDocument());
    runner.rerender();

    const legacyRaw = JSON.stringify({
      schemaVersion: 1,
      projects: [
        {
          id: 'legacy-p1',
          name: 'Legacy Project',
          loginUrl: 'https://jenkins.example/login',
          jobUrl: 'https://jenkins.example/job/legacy/',
        },
      ],
    });

    const success = runner.current.applyRawJson(legacyRaw);
    runner.rerender();

    expect(success).toBe(true);
    expect(runner.current.isDirty).toBe(true);
    expect(runner.current.replacementRevision).toBe(2);
    expect(runner.current.currentDoc?.jobColumns).toEqual([{ id: 'default', name: 'Job URL' }]);
    expect(runner.current.currentDoc?.projects[0]?.jobs).toEqual({
      default: 'https://jenkins.example/job/legacy/',
    });
    expect(runner.current.currentDoc?.projects[0]?.selectedJobColumns).toEqual(['default']);
  });

  test('exposed matrix transition methods on useConfigDocumentEditor update model and mark dirty', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.replaceDocument({
      schemaVersion: 1,
      jobColumns: [{ id: 'col1', name: 'Column 1' }],
      projects: [
        {
          id: 'p1',
          name: 'P1',
          loginUrl: 'https://jenkins.example/login',
          jobUrl: 'https://jenkins.example/job/1',
          jobs: { col1: 'https://jenkins.example/job/1' },
          selectedJobColumns: ['col1'],
        },
      ],
    });
    runner.rerender();
    expect(runner.current.isDirty).toBe(false);

    // Add column
    runner.current.addJobColumn({ id: 'col2', name: 'Column 2' });
    runner.rerender();
    expect(runner.current.isDirty).toBe(true);
    expect(runner.current.currentDoc?.jobColumns?.length).toBe(2);
    expect(runner.current.currentDoc?.projects[0]?.jobs?.col2).toBe('');

    // Update cell
    runner.current.updateJobCell(0, 'col2', 'https://jenkins.example/job/2');
    runner.rerender();
    expect(runner.current.currentDoc?.projects[0]?.jobs?.col2).toBe('https://jenkins.example/job/2');

    // Toggle selection
    runner.current.toggleProjectJobSelection(0, 'col2', true);
    runner.rerender();
    expect(runner.current.currentDoc?.projects[0]?.selectedJobColumns).toEqual(['col1', 'col2']);

    // Rename column
    runner.current.renameJobColumn('col2', 'Renamed Col 2');
    runner.rerender();
    expect(runner.current.currentDoc?.jobColumns?.[1]?.name).toBe('Renamed Col 2');

    // Add project matrix draft
    const newId = runner.current.addProjectMatrixDraft();
    runner.rerender();
    expect(newId).toBe('new-project');
    expect(runner.current.currentDoc?.projects.length).toBe(2);

    // Clone project matrix draft
    const cloneId = runner.current.cloneProjectMatrixDraft(runner.current.currentDoc!.projects[0]!);
    runner.rerender();
    expect(cloneId).toBe('p1-copy');
    expect(runner.current.currentDoc?.projects.length).toBe(3);
    expect(runner.current.currentDoc?.projects[2]?.selectedJobColumns).toEqual([]);

    // Remove column
    const removed = runner.current.removeJobColumn('col2');
    runner.rerender();
    expect(removed).toBe(true);
    expect(runner.current.currentDoc?.jobColumns?.length).toBe(1);
  });
});

test.describe('useConfigManager - lifecycle and replacement revision', () => {
  function createMockApi(initialDoc = sampleDocument()) {
    let currentSavedDoc = initialDoc;
    let etagCounter = 1;

    const dummyResponse = new Response('{}', { status: 200 });
    const api: UseControlApiResult = {
      csrfToken: 'mock-csrf-token',
      setCsrfToken: () => { },
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
      setCsrfToken: () => { },
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

  test('loadConfig sequence guard discards out-of-order stale response', async () => {
    const { promise: firstPromise, resolve: resolveFirst } = Promise.withResolvers<void>();
    const dummyResponse = new Response('{}', { status: 200 });
    const seqApi: UseControlApiResult = {
      csrfToken: 'mock-csrf-token',
      setCsrfToken: () => { },
      apiFetch: async () => dummyResponse,
      requestJson: async <T>(url: string): Promise<{ data: T; response: Response }> => {
        if (url.includes('config-slow.json')) {
          await firstPromise;
          return {
            data: {
              name: 'config-slow.json',
              etag: '"etag-slow"',
              document: {
                schemaVersion: 1,
                projects: [{ id: 'slow', name: 'Slow', loginUrl: 'http://a', jobUrl: 'http://a' }],
              },
            } as unknown as T,
            response: dummyResponse,
          };
        }
        if (url.includes('config-fast.json')) {
          return {
            data: {
              name: 'config-fast.json',
              etag: '"etag-fast"',
              document: {
                schemaVersion: 1,
                projects: [{ id: 'fast', name: 'Fast', loginUrl: 'http://b', jobUrl: 'http://b' }],
              },
            } as unknown as T,
            response: dummyResponse,
          };
        }
        return { data: {} as T, response: dummyResponse };
      },
    };

    const runner = createHookRunner(() => useConfigManager(seqApi));

    // Start loading slow config (seq 1)
    const p1 = runner.current.loadConfig('config-slow.json');
    // Immediately start loading fast config (seq 2)
    const p2 = runner.current.loadConfig('config-fast.json');

    // Fast config finishes first
    await p2;
    runner.rerender();
    expect(runner.current.activeConfigName).toBe('config-fast.json');
    expect(runner.current.etag).toBe('"etag-fast"');

    // Now resolve slow config afterwards
    resolveFirst();
    await p1;
    runner.rerender();

    // Slow config must NOT overwrite the fast config
    expect(runner.current.activeConfigName).toBe('config-fast.json');
    expect(runner.current.etag).toBe('"etag-fast"');
  });

  test('saveConfig on 409 conflict retains unsaved draft and displays conflict banner', async () => {
    const dummyResponse = new Response('{}', { status: 200 });
    const conflictApi: UseControlApiResult = {
      csrfToken: 'mock-csrf-token',
      setCsrfToken: () => { },
      apiFetch: async (_url, init) => {
        if (init?.method === 'PUT') {
          return new Response(JSON.stringify({ error: { message: 'Version conflict' } }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          });
        }
        return dummyResponse;
      },
      requestJson: async <T>(url: string): Promise<{ data: T; response: Response }> => {
        return {
          data: {
            name: 'test-config.json',
            etag: '"etag-1"',
            document: sampleDocument(),
          } as unknown as T,
          response: dummyResponse,
        };
      },
    };

    const runner = createHookRunner(() => useConfigManager(conflictApi));
    await runner.current.loadConfig('test-config.json');
    runner.rerender();

    // 1. Verify invalid draft blocks save
    runner.current.addProjectMatrixDraft();
    runner.rerender();
    expect(runner.current.isDirty).toBe(true);
    const invalidSaveResult = await runner.current.saveConfig();
    runner.rerender();
    expect(invalidSaveResult).toBe(false);
    expect(runner.current.banner?.message).toContain('Cannot save an invalid configuration');

    // Remove the incomplete draft and make a valid edit
    runner.current.removeProjectAt(2);
    runner.rerender();
    runner.current.updateProjectAt(0, { name: 'Valid Rename' });
    runner.rerender();
    expect(runner.current.isDirty).toBe(true);
    const validDoc = runner.current.currentDoc;

    // 2. Try to save valid edit and get 409 conflict
    const saveResult = await runner.current.saveConfig();
    runner.rerender();

    expect(saveResult).toBe(false);
    // Unsaved document MUST be retained
    expect(runner.current.currentDoc).toBe(validDoc);
    expect(runner.current.isDirty).toBe(true);
    expect(runner.current.banner?.type).toBe('error');
    expect(runner.current.banner?.message).toContain('Conflict: Config was modified elsewhere');
  });
});
