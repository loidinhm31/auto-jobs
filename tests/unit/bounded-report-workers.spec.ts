import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser } from '@playwright/test';

import { ArtifactPaths } from '../../src/artifacts/artifact-paths.js';
import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { DEFAULT_SELECTORS } from '../../src/config-selectors.js';
import { runConfiguredProjects } from '../../src/runner.js';
import { runProject, type CaptureResult } from '../../src/project/project-runner.js';

function fakeBrowser(onClose?: () => void): Browser {
  return {
    newContext: async () => ({
      newPage: async () => ({}),
      close: async () => undefined,
    }),
    close: async () => {
      if (onClose) onClose();
    },
  } as unknown as Browser;
}

function sampleProject(id: string, artifactDir: string): NormalizedProjectConfig {
  return {
    schemaVersion: 1,
    id,
    name: `Project ${id}`,
    runType: 'report',
    enabled: true,
    loginUrl: 'https://jenkins.example/login',
    jobUrl: `https://jenkins.example/job/${id}/`,
    timeoutMs: 10_000,
    browser: 'chromium',
    artifactDir,
    selectors: DEFAULT_SELECTORS,
    credentialVariables: {
      usernameVariable: 'A_USER',
      passwordVariable: 'A_PASSWORD',
    },
    sourceOrigins: {
      jenkins: 'https://jenkins.example',
      snyk: [],
      sonarqube: [],
    },
    sources: {
      snyk: { allowedOrigins: [] },
      sonarqube: { allowedOrigins: [] },
    },
  };
}

function completeCapture(jobUrl: string): CaptureResult {
  const target = (key: 'jenkins-job' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues') => ({
    key, localAnchor: `#${key}`, state: 'found' as const,
  });
  const source = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  return {
    navigation: {
      'jenkins-job': { ...target('jenkins-job'), localAnchor: '#jenkins', liveUrl: jobUrl },
      'snyk-report': target('snyk-report'),
      'sonarqube-home': target('sonarqube-home'),
      'sonarqube-overall': target('sonarqube-overall'),
      'sonarqube-issues': target('sonarqube-issues'),
    },
    reports: {
      snyk: { ...source, navigation: [target('snyk-report')] },
      sonarqube: { ...source, navigation: [target('sonarqube-home'), target('sonarqube-overall'), target('sonarqube-issues')] },
    },
    warnings: [],
  };
}


test('deterministic 4-project barrier with workerCount: 2 enforces concurrency bound and preserves outcome order', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'barrier-test-'));
  const reportsDir = path.join(root, 'reports');
  const projects = ['p1', 'p2', 'p3', 'p4'].map((id) => sampleProject(id, reportsDir));

  let active = 0;
  let maxActive = 0;
  const started: string[] = [];
  const completed: string[] = [];

  let resolveP1: () => void = () => undefined;
  const barrierP1 = new Promise<void>((r) => { resolveP1 = r; });
  let resolveP2: () => void = () => undefined;
  const barrierP2 = new Promise<void>((r) => { resolveP2 = r; });
  let resolveP3: () => void = () => undefined;
  const barrierP3 = new Promise<void>((r) => { resolveP3 = r; });
  let resolveP4: () => void = () => undefined;
  const barrierP4 = new Promise<void>((r) => { resolveP4 = r; });

  try {
    const runPromise = runConfiguredProjects(projects, {
      workerCount: 2,
      launchBrowser: async () => fakeBrowser(),
      executeProject: async (project) => {
        active += 1;
        if (active > maxActive) maxActive = active;
        started.push(project.id);

        if (project.id === 'p1') {
          await barrierP1;
        } else if (project.id === 'p2') {
          await barrierP2;
        } else if (project.id === 'p3') {
          await barrierP3;
        } else if (project.id === 'p4') {
          await barrierP4;
        }

        completed.push(project.id);
        active -= 1;
        return {
          projectId: project.id,
          name: project.name,
          state: 'success',
          runId: `run-${project.id}`,
          warnings: [],
        };
      },
    });

    // Wait until p1 and p2 have both started
    while (started.length < 2) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    expect(started).toEqual(['p1', 'p2']);
    expect(active).toBe(2);

    // Release p2 first; p3 should start while p1 remains blocked
    resolveP2();
    while (started.length < 3) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    expect(started).toEqual(['p1', 'p2', 'p3']);
    expect(active).toBe(2);

    // Release p1 next; p4 should start while p3 is still blocked
    resolveP1();
    while (started.length < 4) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    expect(started).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(active).toBe(2);

    // Release p4, then p3
    resolveP4();
    while (completed.length < 3) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    resolveP3();

    const result = await runPromise;
    expect(maxActive).toBe(2);
    // Completion order was p2, p1, p4, p3
    expect(completed).toEqual(['p2', 'p1', 'p4', 'p3']);
    // But outcomes MUST be ordered by configuration index
    expect(result.outcomes.map((o) => o.projectId)).toEqual(['p1', 'p2', 'p3', 'p4']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workerCount: 1 runs projects strictly sequentially', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serial-test-'));
  const reportsDir = path.join(root, 'reports');
  const projects = ['s1', 's2', 's3'].map((id) => sampleProject(id, reportsDir));

  let active = 0;
  let maxActive = 0;

  try {
    const result = await runConfiguredProjects(projects, {
      workerCount: 1,
      launchBrowser: async () => fakeBrowser(),
      executeProject: async (project) => {
        active += 1;
        if (active > maxActive) maxActive = active;
        await new Promise<void>((r) => setTimeout(r, 20));
        active -= 1;
        return {
          projectId: project.id,
          name: project.name,
          state: 'success',
          runId: `run-${project.id}`,
          warnings: [],
        };
      },
    });

    expect(maxActive).toBe(1);
    expect(result.outcomes.map((o) => o.projectId)).toEqual(['s1', 's2', 's3']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workerCount: 4 runs 4 projects concurrently', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-test-'));
  const reportsDir = path.join(root, 'reports');
  const projects = ['q1', 'q2', 'q3', 'q4'].map((id) => sampleProject(id, reportsDir));

  let active = 0;
  let maxActive = 0;
  let resolveAll: () => void = () => undefined;
  const barrier = new Promise<void>((r) => { resolveAll = r; });

  try {
    const runPromise = runConfiguredProjects(projects, {
      workerCount: 4,
      launchBrowser: async () => fakeBrowser(),
      executeProject: async (project) => {
        active += 1;
        if (active > maxActive) maxActive = active;
        if (active === 4) resolveAll();
        await barrier;
        active -= 1;
        return {
          projectId: project.id,
          name: project.name,
          state: 'success',
          runId: `run-${project.id}`,
          warnings: [],
        };
      },
    });

    const result = await runPromise;
    expect(maxActive).toBe(4);
    expect(result.outcomes.map((o) => o.projectId)).toEqual(['q1', 'q2', 'q3', 'q4']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('1 project with workerCount: 4 runs safely with effective loop count 1', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'single-quad-test-'));
  const reportsDir = path.join(root, 'reports');
  const projects = [sampleProject('single', reportsDir)];

  try {
    const result = await runConfiguredProjects(projects, {
      workerCount: 4,
      launchBrowser: async () => fakeBrowser(),
      executeProject: async (project) => ({
        projectId: project.id,
        name: project.name,
        state: 'success',
        runId: 'run-single',
        warnings: [],
      }),
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]?.projectId).toBe('single');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejecting worker plus queued sibling yields failed outcome, allows sibling to complete, and sets exitCode 1', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rejection-test-'));
  const reportsDir = path.join(root, 'reports');
  const projects = ['fail-1', 'ok-2', 'ok-3'].map((id) => sampleProject(id, reportsDir));

  try {
    const result = await runConfiguredProjects(projects, {
      workerCount: 2,
      launchBrowser: async () => fakeBrowser(),
      executeProject: async (project) => {
        if (project.id === 'fail-1') {
          throw new Error('immediate crash');
        }
        return {
          projectId: project.id,
          name: project.name,
          state: 'success',
          runId: `run-${project.id}`,
          warnings: [],
        };
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes[0]).toEqual({
      projectId: 'fail-1',
      name: 'Project fail-1',
      state: 'failed',
      runId: 'unallocated',
      warnings: [],
      error: 'project execution failed before a run artifact was allocated',
    });
    expect(result.outcomes[1]?.state).toBe('success');
    expect(result.outcomes[2]?.state).toBe('success');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preflight validation rejects duplicate project IDs before artifact initialization', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-id-test-'));
  const reportsDir = path.join(root, 'reports');
  const projects = [
    sampleProject('dup-id', reportsDir),
    sampleProject('dup-id', reportsDir),
  ];

  let browserLaunched = false;
  try {
    await expect(runConfiguredProjects(projects, {
      launchBrowser: async () => {
        browserLaunched = true;
        return fakeBrowser();
      },
    })).rejects.toThrow(/duplicate project id: dup-id/iu);

    expect(browserLaunched).toBe(false);
    expect(fs.existsSync(reportsDir)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preflight validation rejects invalid workerCount values before artifact initialization', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'invalid-count-test-'));
  const reportsDir = path.join(root, 'reports');
  const projects = [sampleProject('valid', reportsDir)];

  let browserLaunched = false;
  try {
    for (const invalid of [0, 5, -1, 10, 1.5, NaN, Infinity]) {
      await expect(runConfiguredProjects(projects, {
        workerCount: invalid,
        launchBrowser: async () => {
          browserLaunched = true;
          return fakeBrowser();
        },
      })).rejects.toThrow(RangeError);
    }
    expect(browserLaunched).toBe(false);
    expect(fs.existsSync(reportsDir)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('real runProject execution with bounded workers: artifact paths, lock lifecycle, and browser cleanup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-run-project-'));
  const reportsDir = path.join(root, 'reports');
  const projects = ['real-a', 'real-b'].map((id) => sampleProject(id, reportsDir));

  let browserClosed = false;
  const browser = fakeBrowser(() => {
    browserClosed = true;
  });

  let resolveA: () => void = () => undefined;
  const barrierA = new Promise<void>((r) => { resolveA = r; });
  let resolveB: () => void = () => undefined;
  const barrierB = new Promise<void>((r) => { resolveB = r; });
  let onAEntered: () => void = () => undefined;
  const enteredA = new Promise<void>((r) => { onAEntered = r; });
  let onBEntered: () => void = () => undefined;
  const enteredB = new Promise<void>((r) => { onBEntered = r; });
  const artifacts = new ArtifactPaths(reportsDir);

  try {
    const env = { A_USER: 'test-user', A_PASSWORD: 'test-password' };
    const runPromise = runConfiguredProjects(projects, {
      workerCount: 2,
      runtimeEnvironment: env,
      launchBrowser: async () => browser,
      now: () => new Date('2026-09-23T12:00:00.000Z'),
      runIdSuffix: () => '0000000000000001',
      executeProject: async (project, deps) => runProject(project, {
        ...deps,
        capture: async () => completeCapture(project.jobUrl),
        workflow: async (_page, workflowProject, _secrets, _deadline, state) => {
          if (workflowProject.id === 'real-a') {
            onAEntered();
            await barrierA;
          } else {
            onBEntered();
            await barrierB;
          }
          state.transition('authenticated');
          state.transition('job_opened');
          return {
            jobUrl: workflowProject.jobUrl,
            observedAt: '2026-09-23T12:00:00.000Z',
          };
        },
      }),
    });

    // While workers are running:
    await Promise.all([enteredA, enteredB]);
    // 1. Browser is not closed yet
    expect(browserClosed).toBe(false);
    // 2. Lock is held: trying to acquire should fail
    await expect(artifacts.acquireReportRootLock({ waitMs: 0 })).rejects.toThrow(/locked/iu);
    // 3. Aggregate data is not published yet
    expect(fs.existsSync(path.join(reportsDir, 'aggregate-data.json'))).toBe(false);

    // Release workers
    resolveA();
    resolveB();

    const result = await runPromise;
    expect(result.exitCode).toBe(0);
    expect(browserClosed).toBe(true);

    // Artifacts exist
    for (const p of projects) {
      const outcome = result.outcomes.find((o) => o.projectId === p.id);
      expect(outcome?.state).toBe('success');
      const manifestPath = path.join(reportsDir, p.id, outcome!.runId, 'manifest.json');
      const dataPath = path.join(reportsDir, p.id, outcome!.runId, 'data.json');
      const indexPath = path.join(reportsDir, p.id, outcome!.runId, 'index.html');
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(fs.existsSync(dataPath)).toBe(true);
      expect(fs.existsSync(indexPath)).toBe(true);
    }

    // Aggregate is published
    expect(fs.existsSync(path.join(reportsDir, 'aggregate-data.json'))).toBe(true);
    expect(fs.existsSync(path.join(reportsDir, 'index.html'))).toBe(true);

    // Lock is released: can acquire again
    const lock = await artifacts.acquireReportRootLock();
    await lock.release();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('subsequent run with same project and same second clock fails safely without overwriting previous manifest', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'same-second-collision-'));
  const reportsDir = path.join(root, 'reports');
  const projects = [sampleProject('collision-proj', reportsDir)];
  const fixedTime = () => new Date('2026-09-23T12:00:00.000Z');
  const fixedSuffix = () => '0000000000000001';

  try {
    // First run succeeds
    const env = { A_USER: 'test-user', A_PASSWORD: 'test-password' };
    const firstResult = await runConfiguredProjects(projects, {
      runtimeEnvironment: env,
      launchBrowser: async () => fakeBrowser(),
      now: fixedTime,
      runIdSuffix: fixedSuffix,
      executeProject: async (project, deps) => runProject(project, {
        ...deps,
        capture: async () => completeCapture(project.jobUrl),
        workflow: async (_page, workflowProject, _secrets, _deadline, state) => {
          state.transition('authenticated');
          state.transition('job_opened');
          return {
            jobUrl: workflowProject.jobUrl,
            observedAt: '2026-09-23T12:00:00.000Z',
          };
        },
      }),
    });

    expect(firstResult.exitCode).toBe(0);
    const runId = firstResult.outcomes[0]!.runId;
    const manifestPath = path.join(reportsDir, 'collision-proj', runId, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const originalManifestContent = fs.readFileSync(manifestPath, 'utf8');

    // Second run with same timestamp and suffix: allocation fails safely
    const secondResult = await runConfiguredProjects(projects, {
      runtimeEnvironment: env,
      launchBrowser: async () => fakeBrowser(),
      now: fixedTime,
      runIdSuffix: fixedSuffix,
      executeProject: async (project, deps) => runProject(project, {
        ...deps,
        capture: async () => completeCapture(project.jobUrl),
        workflow: async (_page, workflowProject, _secrets, _deadline, state) => {
          state.transition('authenticated');
          state.transition('job_opened');
          return {
            jobUrl: workflowProject.jobUrl,
            observedAt: '2026-09-23T12:00:00.000Z',
          };
        },
      }),
    });

    expect(secondResult.exitCode).toBe(1);
    expect(secondResult.outcomes[0]?.state).toBe('failed');

    // Original manifest was NOT modified or corrupted
    const currentManifestContent = fs.readFileSync(manifestPath, 'utf8');
    expect(currentManifestContent).toBe(originalManifestContent);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
