import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../src/config/config-types.js';
import { DEFAULT_SELECTORS } from '../../src/config-selectors.js';
import { executeAutoBuildWorkerPool } from '../../src/project/auto-build-worker-pool.js';
import { executeControlRun } from '../../src/reporting/report-server-run-executor.js';
import { createConfigStore } from '../../src/reporting/report-server-config-store.js';
import { createSecretStore } from '../../src/reporting/report-server-secret-store.js';
import type { ControlRunRecord, RunManagerOptions } from '../../src/reporting/report-server-run-manager.js';

function withResolvers<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function sampleBuildProject(
  id: string,
  overrides?: Partial<NormalizedProjectConfig>,
): NormalizedProjectConfig {
  return {
    schemaVersion: 1,
    id,
    name: `Build Project ${id}`,
    runType: 'auto-build',
    enabled: true,
    loginUrl: 'https://jenkins.example/login',
    jobUrl: `https://jenkins.example/job/${id}/`,
    timeoutMs: 10_000,
    browser: 'chromium',
    artifactDir: '/tmp/reports',
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
    ...overrides,
  };
}
function createBuildConfig(
  artifactDir: string,
  projects: Array<{
    id: string;
    name?: string;
    runType?: 'report' | 'auto-build';
    enabled?: boolean;
    jobUrl?: string;
  }>,
  reportWorkers = 1,
) {
  return {
    schemaVersion: 1,
    reportWorkers,
    defaults: { artifactDir },
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name ?? `Build ${p.id}`,
      runType: p.runType ?? 'auto-build',
      enabled: p.enabled ?? true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: p.jobUrl ?? `https://jenkins.example.com/job/${p.id}/`,
      credentials: {
        usernameVariable: 'A_USER',
        passwordVariable: 'A_PASSWORD',
      },
    })),
  };
}

function createMockRecord(
  id: string,
  etag: string,
  runType: 'auto-build' | 'report',
  projectId?: string,
): ControlRunRecord {
  return {
    id,
    configName: 'default.json',
    configEtag: etag,
    runType,
    projectId,
    status: 'queued',
    queuedAt: new Date().toISOString(),
    logs: [],
  };
}

test.describe('Bounded Auto-Build Worker Pool & Execution', () => {
  test('deterministic 4-project barrier with workerCount: 2 enforces concurrency bound and preserves outcome order', async () => {
    const projects = ['b1', 'b2', 'b3', 'b4'].map((id) => sampleBuildProject(id));

    let active = 0;
    let maxActive = 0;
    const started: string[] = [];
    const completed: string[] = [];

    const { promise: barrierB1, resolve: resolveB1 } = withResolvers<void>();
    const { promise: barrierB2, resolve: resolveB2 } = withResolvers<void>();
    const { promise: barrierB3, resolve: resolveB3 } = withResolvers<void>();
    const { promise: barrierB4, resolve: resolveB4 } = withResolvers<void>();

    const runPromise = executeAutoBuildWorkerPool({
      projects,
      workerCount: 2,
      executeProject: async (project) => {
        active += 1;
        if (active > maxActive) maxActive = active;
        started.push(project.id);

        if (project.id === 'b1') {
          await barrierB1;
        } else if (project.id === 'b2') {
          await barrierB2;
        } else if (project.id === 'b3') {
          await barrierB3;
        } else if (project.id === 'b4') {
          await barrierB4;
        }

        completed.push(project.id);
        active -= 1;
        return {
          projectId: project.id,
          projectName: project.name,
          state: 'submitted',
          jobUrl: project.jobUrl,
          exitCode: 0,
        };
      },
    });

    // Wait until b1 and b2 have both started
    while (started.length < 2) {
      await delay(10);
    }
    expect(started).toEqual(['b1', 'b2']);
    expect(active).toBe(2);

    // Release b2 first; b3 should start while b1 remains blocked
    resolveB2();
    while (started.length < 3) {
      await delay(10);
    }
    expect(started).toEqual(['b1', 'b2', 'b3']);
    expect(active).toBe(2);

    // Release b1 next; b4 should start while b3 is still blocked
    resolveB1();
    while (started.length < 4) {
      await delay(10);
    }
    expect(started).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(active).toBe(2);

    // Release b4, then b3
    resolveB4();
    while (completed.length < 3) {
      await delay(10);
    }
    resolveB3();

    const outcomes = await runPromise;
    expect(maxActive).toBe(2);
    // Completion order was b2, b1, b4, b3
    expect(completed).toEqual(['b2', 'b1', 'b4', 'b3']);
    // But outcomes MUST be ordered by configuration index
    expect(outcomes.map((o) => o.projectId)).toEqual(['b1', 'b2', 'b3', 'b4']);
  });

  test('workerCount: 1 runs projects strictly sequentially', async () => {
    const projects = ['b1', 'b2'].map((id) => sampleBuildProject(id));
    let active = 0;
    let maxActive = 0;

    const outcomes = await executeAutoBuildWorkerPool({
      projects,
      workerCount: 1,
      executeProject: async (project) => {
        active += 1;
        if (active > maxActive) maxActive = active;
        await delay(20);
        active -= 1;
        return {
          projectId: project.id,
          projectName: project.name,
          state: 'submitted',
          jobUrl: project.jobUrl,
          exitCode: 0,
        };
      },
    });

    expect(maxActive).toBe(1);
    expect(outcomes.length).toBe(2);
  });

  test('isolates thrown executor error to submission-unknown outcome and continues siblings', async () => {
    const projects = ['b1', 'b2', 'b3'].map((id) => sampleBuildProject(id));
    const executed: string[] = [];

    const outcomes = await executeAutoBuildWorkerPool({
      projects,
      workerCount: 2,
      executeProject: async (project) => {
        executed.push(project.id);
        if (project.id === 'b2') {
          throw new Error('Unexpected network failure during submit');
        }
        return {
          projectId: project.id,
          projectName: project.name,
          state: 'submitted',
          jobUrl: project.jobUrl,
          exitCode: 0,
        };
      },
    });

    expect(executed).toEqual(['b1', 'b2', 'b3']);
    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]!.state).toBe('submitted');
    expect(outcomes[0]!.exitCode).toBe(0);

    expect(outcomes[1]!.projectId).toBe('b2');
    expect(outcomes[1]!.state).toBe('submission-unknown');
    expect(outcomes[1]!.exitCode).toBe(1);
    expect(outcomes[1]!.error).toBe('Unexpected network failure during submit');

    expect(outcomes[2]!.state).toBe('submitted');
    expect(outcomes[2]!.exitCode).toBe(0);
  });

  test('executeControlRun with omitted projectId runs all enabled auto-build projects with saved worker bound', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-autobuild-'));
    try {
      const configRoot = path.join(root, 'config');
      fs.mkdirSync(configRoot, { recursive: true });

      const configData = createBuildConfig(root, [
        { id: 'build-1' },
        { id: 'build-2' },
        { id: 'build-3' },
        { id: 'build-disabled', enabled: false },
        { id: 'report-only', runType: 'report' },
      ], 2);
      fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(configData), 'utf8');

      const configStore = await createConfigStore(configRoot);
      const entry = await configStore.readConfig('default.json');

      const invokedProjects: string[] = [];
      const options: RunManagerOptions = {
        configStore,
        reportRoot: root,
        env: {},
        autoBuildExecutor: async (project) => {
          invokedProjects.push(project.id);
          return {
            projectId: project.id,
            projectName: project.name,
            state: 'submitted',
            jobUrl: project.jobUrl,
            exitCode: 0,
          };
        },
      };

      const record = createMockRecord('run-bulk-autobuild', entry.etag, 'auto-build');
      await executeControlRun(record, options, () => {});

      expect(record.status).toBe('succeeded');
      // Only enabled auto-build projects invoked
      expect(invokedProjects).toEqual(['build-1', 'build-2', 'build-3']);
      expect(record.result?.buildProjects).toHaveLength(3);
      expect(record.result?.buildProjects?.map((p) => p.projectId)).toEqual(['build-1', 'build-2', 'build-3']);
      // Multi-project run does not populate single-project scalar status
      expect(record.result?.buildState).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('executeControlRun sets failed status if any project in batch fails', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-autobuild-fail-'));
    try {
      const configRoot = path.join(root, 'config');
      fs.mkdirSync(configRoot, { recursive: true });

      const configData = createBuildConfig(root, [
        { id: 'build-ok' },
        { id: 'build-failed' },
      ], 2);
      fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(configData), 'utf8');

      const configStore = await createConfigStore(configRoot);
      const entry = await configStore.readConfig('default.json');

      const options: RunManagerOptions = {
        configStore,
        reportRoot: root,
        env: {},
        autoBuildExecutor: async (project) => {
          if (project.id === 'build-failed') {
            return {
              projectId: project.id,
              projectName: project.name,
              state: 'failed',
              jobUrl: project.jobUrl,
              exitCode: 1,
              error: 'Build trigger failed',
            };
          }
          return {
            projectId: project.id,
            projectName: project.name,
            state: 'submitted',
            jobUrl: project.jobUrl,
            exitCode: 0,
          };
        },
      };

      const record = createMockRecord('run-batch-fail', entry.etag, 'auto-build');
      await executeControlRun(record, options, () => {});

      expect(record.status).toBe('failed');
      expect(record.result?.buildProjects).toHaveLength(2);
      expect(record.result?.error).toBe('one or more projects reported failures');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('executeControlRun preserves single-project scalar fields and redacts secrets', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-autobuild-single-'));
    try {
      const configRoot = path.join(root, 'config');
      fs.mkdirSync(configRoot, { recursive: true });

      const secretStore = await createSecretStore(configRoot);
      await secretStore.putSecrets({ MY_SECRET_TOKEN: 'super-secret-pass-123' });

      const configData = createBuildConfig(root, [
        { id: 'build-secret' },
      ], 1);
      fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(configData), 'utf8');

      const configStore = await createConfigStore(configRoot);
      const entry = await configStore.readConfig('default.json');

      const logs: string[] = [];
      const options: RunManagerOptions = {
        configStore,
        secretStore,
        reportRoot: root,
        env: {},
        autoBuildExecutor: async (project) => ({
          projectId: project.id,
          projectName: `Project ${project.id} with super-secret-pass-123`,
          state: 'succeeded',
          jobUrl: `${project.jobUrl}?path=super-secret-pass-123`,
          buildPageUrl: `${project.jobUrl}42/super-secret-pass-123`,
          buildNumber: '#42',
          buildResult: 'SUCCESS',
          stages: [
            { index: 1, name: 'Build super-secret-pass-123', status: 'SUCCESS', duration: '12s super-secret-pass-123' },
          ],
          exitCode: 0,
        }),
      };

      const record = createMockRecord('run-single-secret', entry.etag, 'auto-build', 'build-secret');
      await executeControlRun(record, options, (msg) => logs.push(msg));

      expect(record.status).toBe('succeeded');
      // Scalar fields populated for single project
      expect(record.result?.buildState).toBe('succeeded');
      expect(record.result?.buildNumber).toBe('#42');
      expect(record.result?.buildResult).toBe('SUCCESS');
      expect(record.result?.buildProjects).toHaveLength(1);

      // Verify secret redaction
      const outcome = record.result?.buildProjects?.[0];
      expect(outcome?.projectName).not.toContain('super-secret-pass-123');
      expect(outcome?.projectName).toContain('[REDACTED]');
      expect(outcome?.jobUrl).not.toContain('super-secret-pass-123');
      expect(outcome?.jobUrl).toContain('[REDACTED]');
      expect(outcome?.buildPageUrl).not.toContain('super-secret-pass-123');
      expect(outcome?.buildPageUrl).toContain('[REDACTED]');

      const stage = outcome?.stages?.[0];
      expect(stage?.name).toContain('[REDACTED]');
      expect(stage?.duration).toContain('[REDACTED]');

      // Logs must also be redacted
      for (const log of logs) {
        expect(log).not.toContain('super-secret-pass-123');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('executeControlRun fails if no enabled auto-build projects exist', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-autobuild-empty-'));
    try {
      const configRoot = path.join(root, 'config');
      fs.mkdirSync(configRoot, { recursive: true });

      const configData = createBuildConfig(root, [
        { id: 'report-only', runType: 'report' },
      ], 1);
      fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(configData), 'utf8');

      const configStore = await createConfigStore(configRoot);
      const entry = await configStore.readConfig('default.json');

      const options: RunManagerOptions = {
        configStore,
        reportRoot: root,
        env: {},
        autoBuildExecutor: async (project) => ({
          projectId: project.id,
          projectName: project.name,
          state: 'submitted',
          jobUrl: project.jobUrl,
          exitCode: 0,
        }),
      };

      const record = createMockRecord('run-empty-autobuild', entry.etag, 'auto-build');
      await expect(executeControlRun(record, options, () => {})).rejects.toThrow(
        'no enabled auto-build projects found in configuration',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
