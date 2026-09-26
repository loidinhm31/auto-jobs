import { expect, test } from '@playwright/test';
import React from 'react';
import {
  cloneProjectDraft,
  generateCloneProjectId,
  generateCloneProjectName,
  MAX_PROJECT_ID_LENGTH,
} from '../../src/reporting/control-page/utils/clone-project-draft.js';
import { ConfigFormBuilder } from '../../src/reporting/control-page/components/organisms/ConfigFormBuilder.js';
import { useConfigDocumentEditor } from '../../src/reporting/control-page/hooks/useConfigDocumentEditor.js';
import type {
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../../src/reporting/control-page/types/index.js';

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
  const effectDeps: Array<unknown[] | undefined> = [];
  let stateIndex = 0;
  let effectIndex = 0;
  const result: { current?: T } = {};

  const reactWithInternals = React as unknown as ReactInternalsContainer;
  const internals =
    reactWithInternals.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const originalDispatcher = internals.H;

  function rerender() {
    stateIndex = 0;
    effectIndex = 0;
    const effectsToRun: Array<() => void | (() => void)> = [];
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
      useEffect(fn: () => void | (() => void), deps?: unknown[]) {
        const idx = effectIndex++;
        const prevDeps = effectDeps[idx];
        const hasChanged =
          prevDeps === undefined ||
          deps === undefined ||
          deps.some((dep, i) => !Object.is(dep, prevDeps[i]));

        if (hasChanged) {
          effectDeps[idx] = deps;
          effectsToRun.push(fn);
        }
      },
    };

    try {
      result.current = hookFn();
      for (const eff of effectsToRun) {
        eff();
      }
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

function getProps(element: unknown): Record<string, any> {
  return ((element as React.ReactElement<Record<string, any>>)?.props ?? {}) as Record<string, any>;
}

function findNode(node: any, predicate: (props: Record<string, any>) => boolean): any {
  if (!node) return null;
  const props = getProps(node);
  if (predicate(props)) return node;
  const children = props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  } else if (children && typeof children === 'object') {
    const found = findNode(children, predicate);
    if (found) return found;
  }
  return null;
}

const sampleProject: ProjectConfigInput = {
  id: 'jenkins-core',
  name: 'Jenkins Core Build',
  groupId: 'platform-team',
  loginUrl: 'https://ci.example.com/login',
  jobUrl: 'https://ci.example.com/job/core-build',
  runType: 'auto-build',
  enabled: true,
  waitForCompletion: true,
  waitTimeoutMs: 30000,
  timeoutMs: 60000,
  browser: 'chromium',
  artifactDir: 'artifacts/core',
  credentials: {
    usernameVariable: 'JENKINS_USER',
    passwordVariable: 'JENKINS_PASS',
  },
  selectors: {
    authLandmark: { kind: 'css', value: '#login', required: true },
  },
  allowedOrigins: ['https://ci.example.com'],
  sourceOrigins: {
    jenkins: ['https://ci.example.com'],
  },
  snyk: {
    projectId: 'snyk-123',
    allowedOrigins: ['https://snyk.io'],
  },
  sonarqube: {
    projectId: 'sonar-456',
    allowedOrigins: ['https://sonarqube.example.com'],
  },
};

const sampleDoc: ProjectConfigDocumentV1 = {
  schemaVersion: 1,
  projects: [sampleProject],
  projectGroups: [{ id: 'platform-team', name: 'Platform Team' }],
};

test.describe('Clone project draft helper (clone-project-draft.ts)', () => {
  test('generates collision-free IDs with -copy suffix', () => {
    const existing = ['jenkins-core'];
    const id = generateCloneProjectId('jenkins-core', existing);
    expect(id).toBe('jenkins-core-copy');
  });

  test('resolves collisions sequentially with -copy-2, -copy-3', () => {
    const existing = ['jenkins-core', 'jenkins-core-copy', 'jenkins-core-copy-2'];
    const id = generateCloneProjectId('jenkins-core', existing);
    expect(id).toBe('jenkins-core-copy-3');
  });

  test('truncates long base ID to guarantee ID <= 63 characters', () => {
    const longId = 'a'.repeat(63);
    const existing: string[] = [];
    const id = generateCloneProjectId(longId, existing);
    expect(id.length).toBeLessThanOrEqual(MAX_PROJECT_ID_LENGTH);
    expect(id.length).toBe(63);
    expect(id).toBe(`${'a'.repeat(58)}-copy`);
    expect(/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)).toBe(true);
  });

  test('truncates base ID appropriately for -copy-2 collision under 63 character limit', () => {
    const longId = 'b'.repeat(63);
    const firstSuffix = `${'b'.repeat(58)}-copy`;
    const existing = [longId, firstSuffix];
    const id = generateCloneProjectId(longId, existing);
    expect(id.length).toBeLessThanOrEqual(MAX_PROJECT_ID_LENGTH);
    expect(id.length).toBe(63);
    expect(id).toBe(`${'b'.repeat(56)}-copy-2`);
    expect(/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)).toBe(true);
  });

  test('generates bounded name with (copy) suffix within 200 characters', () => {
    const name = generateCloneProjectName('My Pipeline');
    expect(name).toBe('My Pipeline (copy)');
  });

  test('truncates long source name to stay within 200 characters', () => {
    const longName = 'X'.repeat(200);
    const clonedName = generateCloneProjectName(longName);
    expect(clonedName.length).toBe(200);
    expect(clonedName).toBe(`${'X'.repeat(193)} (copy)`);
  });

  test('handles empty or missing names gracefully', () => {
    expect(generateCloneProjectName('')).toBe('Project (copy)');
    expect(generateCloneProjectName('   ')).toBe('Project (copy)');
  });

  test('clones deeply: mutates clone without affecting source', () => {
    const existing = [sampleProject.id];
    const clone = cloneProjectDraft(sampleProject, existing);

    expect(clone.id).toBe('jenkins-core-copy');
    expect(clone.name).toBe('Jenkins Core Build (copy)');
    expect(clone.enabled).toBe(false);
    expect('groupId' in clone).toBe(false);
    expect(clone.groupId).toBeUndefined();

    // Verify source remains untouched
    expect(sampleProject.id).toBe('jenkins-core');
    expect(sampleProject.enabled).toBe(true);
    expect(sampleProject.groupId).toBe('platform-team');

    // Verify deep copy of nested objects
    expect(clone.credentials).toEqual(sampleProject.credentials);
    expect(clone.credentials).not.toBe(sampleProject.credentials);
    clone.credentials!.usernameVariable = 'MUTATED_USER';
    expect(sampleProject.credentials!.usernameVariable).toBe('JENKINS_USER');

    expect(clone.selectors).toEqual(sampleProject.selectors);
    expect(clone.selectors).not.toBe(sampleProject.selectors);
    clone.selectors!.authLandmark = { kind: 'css', value: '#mutated', required: true };
    expect(sampleProject.selectors!.authLandmark).toEqual({ kind: 'css', value: '#login', required: true });

    expect(clone.allowedOrigins).toEqual(sampleProject.allowedOrigins);
    expect(clone.allowedOrigins).not.toBe(sampleProject.allowedOrigins);

    // Verify exact URLs and artifactDir preserved
    expect(clone.loginUrl).toBe(sampleProject.loginUrl);
    expect(clone.jobUrl).toBe(sampleProject.jobUrl);
    expect(clone.artifactDir).toBe('artifacts/core');
  });

  test('preserves omitted optional settings as omitted', () => {
    const minimalProject: ProjectConfigInput = {
      id: 'minimal-p',
      name: 'Minimal',
      loginUrl: 'https://ci.example.com/login',
      jobUrl: 'https://ci.example.com/job/min',
      runType: 'report',
      enabled: true,
    };
    const clone = cloneProjectDraft(minimalProject, [minimalProject.id]);
    expect('credentials' in clone).toBe(false);
    expect('selectors' in clone).toBe(false);
    expect('allowedOrigins' in clone).toBe(false);
    expect('artifactDir' in clone).toBe(false);
    expect('groupId' in clone).toBe(false);
    expect(clone.enabled).toBe(false);
  });
});

test.describe('useConfigDocumentEditor addProject supplied clone guards', () => {
  test('rejects supplied project when capacity limit (50) is reached', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    const fiftyProjects: ProjectConfigInput[] = Array.from({ length: 50 }, (_, i) => ({
      id: `proj-${i}`,
      name: `Proj ${i}`,
      loginUrl: 'https://ci.example.com/login',
      jobUrl: `https://ci.example.com/job/${i}`,
      runType: 'report',
      enabled: i === 0,
    }));
    const fullDoc: ProjectConfigDocumentV1 = {
      schemaVersion: 1,
      projects: fiftyProjects,
    };

    runner.current.setDocument(fullDoc, false);
    runner.rerender();

    const cloneAttempt: ProjectConfigInput = {
      id: 'proj-clone',
      name: 'Clone Attempt',
      loginUrl: 'https://ci.example.com/login',
      jobUrl: 'https://ci.example.com/job/clone',
      runType: 'report',
      enabled: false,
    };

    const result = runner.current.addProject(cloneAttempt);
    expect(result).toBeNull();
    expect(runner.current.currentDoc?.projects.length).toBe(50);
  });

  test('rejects supplied project when project ID collides with existing project', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.setDocument(sampleDoc, false);
    runner.rerender();

    const duplicateProject: ProjectConfigInput = {
      ...sampleProject,
      name: 'Duplicate ID',
    };

    const result = runner.current.addProject(duplicateProject);
    expect(result).toBeNull();
    expect(runner.current.currentDoc?.projects.length).toBe(1);
  });

  test('adds valid supplied project and marks document dirty', () => {
    const runner = createHookRunner(() => useConfigDocumentEditor());
    runner.current.setDocument(sampleDoc, false);
    runner.rerender();

    const cloneProject: ProjectConfigInput = cloneProjectDraft(sampleProject, sampleDoc.projects);
    const result = runner.current.addProject(cloneProject);

    expect(result).toBe('jenkins-core-copy');
    runner.rerender();
    expect(runner.current.isDirty).toBe(true);
    expect(runner.current.currentDoc?.projects.length).toBe(2);
    expect(runner.current.currentDoc?.projects[1]?.id).toBe('jenkins-core-copy');
    expect(runner.current.currentDoc?.projects[1]?.enabled).toBe(false);
  });
});

test.describe('ConfigFormBuilder clone and draft lifecycle', () => {
  test('renders Clone selected project button with correct initial enabled state', () => {
    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: sampleDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: 0,
        onAddProject: () => 'new-id',
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    expect(cloneButton).toBeTruthy();
    expect(getProps(cloneButton).children).toBe('Clone selected project');
    expect(getProps(cloneButton).disabled).toBe(false);
  });

  test('disables Clone and Add buttons when document is loading or missing', () => {
    const runnerLoading = createHookRunner(() => {
      return ConfigFormBuilder({
        document: sampleDoc,
        validationErrors: [],
        isLoading: true,
        replacementRevision: 0,
        onAddProject: () => null,
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    const cloneButton = findNode(runnerLoading.current, (p) => p.id === 'btn-clone-project');
    const addButton = findNode(runnerLoading.current, (p) => p.id === 'btn-add-project');
    expect(getProps(cloneButton).disabled).toBe(true);
    expect(getProps(addButton).disabled).toBe(true);
  });

  test('disables Clone and Add buttons when at maximum capacity (50 projects)', () => {
    const fiftyProjects: ProjectConfigInput[] = Array.from({ length: 50 }, (_, i) => ({
      id: `proj-${i}`,
      name: `Proj ${i}`,
      loginUrl: 'https://ci.example.com/login',
      jobUrl: `https://ci.example.com/job/${i}`,
      runType: 'report',
      enabled: i === 0,
    }));
    const fullDoc: ProjectConfigDocumentV1 = {
      schemaVersion: 1,
      projects: fiftyProjects,
    };

    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: fullDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: 0,
        onAddProject: () => null,
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    const addButton = findNode(runner.current, (p) => p.id === 'btn-add-project');
    expect(getProps(cloneButton).disabled).toBe(true);
    expect(getProps(addButton).disabled).toBe(true);
  });

  test('clicking Clone opens draft with cloneSourceId, explanation banner, and disabled clone', () => {
    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: sampleDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: 0,
        onAddProject: () => 'jenkins-core-copy',
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    // Find and click the clone button
    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    expect(cloneButton).toBeTruthy();
    getProps(cloneButton).onClick();
    runner.rerender();

    // After clicking clone, verify banner appears
    const banner = findNode(runner.current, (p) => p.role === 'status' && p.className?.includes('bg-sky-50'));
    expect(banner).toBeTruthy();
    const bannerTitle = getProps(getProps(banner).children[0]).children;
    const bannerDesc = getProps(getProps(banner).children[1]).children;
    expect(bannerTitle).toBe("Cloned project draft (from 'jenkins-core')");
    expect(bannerDesc).toContain("Cloned from 'jenkins-core'");
    expect(bannerDesc).toContain('Disabled by default');
    expect(bannerDesc).toContain('Review copied job URL and settings before enabling');

    // Verify Add and Clone buttons are now disabled while adding
    const updatedCloneBtn = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    const updatedAddBtn = findNode(runner.current, (p) => p.id === 'btn-add-project');
    expect(getProps(updatedCloneBtn).disabled).toBe(true);
    expect(getProps(updatedAddBtn).disabled).toBe(true);
  });

  test('canceling a clone draft restores normal view without modifying document', () => {
    let addedCount = 0;
    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: sampleDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: 0,
        onAddProject: () => {
          addedCount += 1;
          return 'added';
        },
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    // Start clone
    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    getProps(cloneButton).onClick();
    runner.rerender();

    // Find Cancel button
    const cancelButton = findNode(runner.current, (p) => p.id === 'btn-cancel-project');
    expect(cancelButton).toBeTruthy();
    getProps(cancelButton).onClick();
    runner.rerender();

    // Verify draft mode is closed
    const updatedCloneBtn = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    expect(getProps(updatedCloneBtn).disabled).toBe(false);
    expect(addedCount).toBe(0);
  });

  test('replacementRevision increment clears pending clone draft', () => {
    let revision = 0;
    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: sampleDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: revision,
        onAddProject: () => 'added',
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    // Open clone draft
    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    getProps(cloneButton).onClick();
    runner.rerender();

    // Verify draft banner is present
    const banner = findNode(runner.current, (p) => p.role === 'status' && p.className?.includes('bg-sky-50'));
    expect(banner).toBeTruthy();

    // Simulate document replacement (e.g. reload or raw JSON apply)
    revision = 1;
    runner.rerender();
    runner.rerender();

    // Verify draft is reset and clone button enabled again
    const updatedCloneBtn = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    expect(getProps(updatedCloneBtn).disabled).toBe(false);
    const updatedBanner = findNode(runner.current, (p) => p.role === 'status' && p.className?.includes('bg-sky-50'));
    expect(updatedBanner).toBeNull();
  });
  test('Save Project commits valid clone draft via onAddProject', () => {
    let committedProject: ProjectConfigInput | null = null;
    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: sampleDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: 0,
        onAddProject: (proj) => {
          committedProject = proj ?? null;
          return proj?.id ?? 'added';
        },
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    // Open clone draft
    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    getProps(cloneButton).onClick();
    runner.rerender();

    // Click Save Project
    const saveButton = findNode(runner.current, (p) => p.id === 'btn-save-project');
    expect(saveButton).toBeTruthy();
    getProps(saveButton).onClick();
    runner.rerender();

    // Verify onAddProject was called with cloned project input
    expect(committedProject).not.toBeNull();
    expect((committedProject as any).id).toBe('jenkins-core-copy');
    expect((committedProject as any).enabled).toBe(false);
    expect('groupId' in (committedProject as any)).toBe(false);

    // Verify draft closed
    const banner = findNode(runner.current, (p) => p.role === 'status' && p.className?.includes('bg-sky-50'));
    expect(banner).toBeNull();
  });

  test('Save Project displays error and preserves draft when duplicate ID is used', () => {
    let addCalled = false;
    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: sampleDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: 0,
        onAddProject: () => {
          addCalled = true;
          return 'added';
        },
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    // Open clone draft
    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    getProps(cloneButton).onClick();
    runner.rerender();

    // Simulate user editing draft ID to collide with 'jenkins-core' via editor onUpdate
    const editor = findNode(runner.current, (p) => p.project !== undefined && typeof p.onUpdate === 'function');
    expect(editor).toBeTruthy();
    getProps(editor).onUpdate((prev: ProjectConfigInput) => ({ ...prev, id: 'jenkins-core' }));
    runner.rerender();

    // Click Save Project
    const saveButton = findNode(runner.current, (p) => p.id === 'btn-save-project');
    expect(saveButton).toBeTruthy();
    getProps(saveButton).onClick();
    runner.rerender();

    // Verify addition was blocked and error banner displayed
    expect(addCalled).toBe(false);
    const errorAlert = findNode(runner.current, (p) => p.role === 'alert' && p['aria-label'] === 'Configuration validation errors');
    expect(errorAlert).toBeTruthy();
    const errorText = JSON.stringify(getProps(errorAlert));
    expect(errorText).toContain("must be unique; 'jenkins-core' is already in use");

    // Verify draft is still open
    const banner = findNode(runner.current, (p) => p.role === 'status' && p.className?.includes('bg-sky-50'));
    expect(banner).toBeTruthy();
  });

  test('selecting another project in dropdown cancels the pending clone draft', () => {
    const twoProjectDoc: ProjectConfigDocumentV1 = {
      schemaVersion: 1,
      projects: [
        sampleProject,
        {
          id: 'secondary-p',
          name: 'Secondary',
          loginUrl: 'https://ci.example.com/login',
          jobUrl: 'https://ci.example.com/job/sec',
          runType: 'report',
          enabled: true,
        },
      ],
    };

    const runner = createHookRunner(() => {
      return ConfigFormBuilder({
        document: twoProjectDoc,
        validationErrors: [],
        isLoading: false,
        replacementRevision: 0,
        onAddProject: () => 'added',
        onUpdateProject: () => {},
        onRemoveProject: () => true,
        onUpdateDefaults: () => {},
      });
    });

    // Open clone draft
    const cloneButton = findNode(runner.current, (p) => p.id === 'btn-clone-project');
    getProps(cloneButton).onClick();
    runner.rerender();

    // Verify draft is open
    let banner = findNode(runner.current, (p) => p.role === 'status' && p.className?.includes('bg-sky-50'));
    expect(banner).toBeTruthy();

    // Change selected project to index 1 via Select
    const select = findNode(runner.current, (p) => p.id === 'project-selection');
    expect(select).toBeTruthy();
    getProps(select).onChange({ target: { value: '1' } });
    runner.rerender();

    // Verify draft is closed
    banner = findNode(runner.current, (p) => p.role === 'status' && p.className?.includes('bg-sky-50'));
    expect(banner).toBeNull();
  });
});
