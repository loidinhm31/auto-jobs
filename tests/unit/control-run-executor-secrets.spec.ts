import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import type { RunnerDependencies } from '../../src/runner.js';
import { createConfigStore } from '../../src/reporting/report-server-config-store.js';
import { createSecretStore } from '../../src/reporting/report-server-secret-store.js';
import { createRunManager, type RunManagerOptions } from '../../src/reporting/report-server-run-manager.js';
import { executeControlRun } from '../../src/reporting/report-server-run-executor.js';
import {
  createValidConfig,
  createMockRecord,
  createMockReportResult,
  waitForRunCompletion,
} from './control-run-executor-fixture.js';

test.describe('Run Executor Environment Injection & Secret Redaction', () => {
  let configRoot: string;
  let reportRoot: string;

  test.beforeEach(() => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-sec-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-sec-rep-'));
    fs.writeFileSync(path.join(reportRoot, 'index.html'), '<html></html>', 'utf8');
    fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(createValidConfig(reportRoot)), 'utf8');
  });

  test.afterEach(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('injects stored secrets into runEnv for report run', async () => {
    const configStore = await createConfigStore(configRoot);
    const secretStore = await createSecretStore(configRoot);
    await secretStore.putSecrets({ JENKINS_USER: 'stored-operator', JENKINS_PASS: 'secret-pass-123' });

    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const options: RunManagerOptions = {
      configStore,
      secretStore,
      reportRoot,
      env: {},
      reportExecutor: async (_projects, deps) => {
        capturedEnv = deps?.runtimeEnvironment;
        return createMockReportResult(reportRoot);
      },
    };

    const entry = await configStore.readConfig('default.json');
    const record = createMockRecord('run-1', entry.etag, 'report');
    await executeControlRun(record, options, () => {});

    expect(record.status).toBe('succeeded');
    expect(capturedEnv?.JENKINS_USER).toBe('stored-operator');
    expect(capturedEnv?.JENKINS_PASS).toBe('secret-pass-123');
  });

  test('injects stored secrets into runEnv for auto-build run', async () => {
    const configStore = await createConfigStore(configRoot);
    const secretStore = await createSecretStore(configRoot);
    await secretStore.putSecrets({ JENKINS_USER: 'bot-user', JENKINS_PASS: 'bot-token-xyz' });
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const options: RunManagerOptions = {
      configStore,
      secretStore,
      reportRoot,
      env: {},
      autoBuildExecutor: async (project, deps) => {
        capturedEnv = deps?.runtimeEnvironment;
        return { projectId: project.id, projectName: project.name, state: 'submitted', jobUrl: project.jobUrl, exitCode: 0 };
      },
    };

    const entry = await configStore.readConfig('default.json');
    const record = createMockRecord('run-2', entry.etag, 'auto-build', 'build-proj');
    await executeControlRun(record, options, () => {});

    expect(record.status).toBe('succeeded');
    expect(capturedEnv?.JENKINS_USER).toBe('bot-user');
    expect(capturedEnv?.JENKINS_PASS).toBe('bot-token-xyz');
  });

  test('stored secrets take precedence over base env without mutating base env', async () => {
    const configStore = await createConfigStore(configRoot);
    const secretStore = await createSecretStore(configRoot);
    await secretStore.putSecrets({ JENKINS_PASS: 'fresh-secret' });

    const baseEnv: NodeJS.ProcessEnv = { JENKINS_USER: 'base-user', JENKINS_PASS: 'stale-secret', OTHER_KEY: 'keep-val' };
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const options: RunManagerOptions = {
      configStore,
      secretStore,
      reportRoot,
      env: baseEnv,
      reportExecutor: async (_p, deps) => {
        capturedEnv = deps?.runtimeEnvironment;
        return createMockReportResult(reportRoot);
      },
    };
    const entry = await configStore.readConfig('default.json');
    const record = createMockRecord('run-3', entry.etag, 'report');
    await executeControlRun(record, options, () => {});

    expect(capturedEnv?.JENKINS_PASS).toBe('fresh-secret');
    expect(capturedEnv?.JENKINS_USER).toBe('base-user');
    expect(capturedEnv?.OTHER_KEY).toBe('keep-val');
    expect(baseEnv.JENKINS_PASS).toBe('stale-secret');
  });

  test('redacts secret values from addLog, errors, and warnings', async () => {
    const configStore = await createConfigStore(configRoot);
    const secretStore = await createSecretStore(configRoot);
    const secretKey = 'report';
    await secretStore.putSecrets({ JENKINS_USER: 'adm', JENKINS_PASS: secretKey });

    const emittedLogs: string[] = [];
    const options: RunManagerOptions = {
      configStore,
      secretStore,
      reportRoot,
      env: {},
      reportExecutor: async () => createMockReportResult(reportRoot, [`Warning containing ${secretKey}`]),
    };

    const entry = await configStore.readConfig('default.json');
    const record = createMockRecord('run-4', entry.etag, 'report');
    await executeControlRun(record, options, (msg) => emittedLogs.push(msg));

    expect(emittedLogs.length).toBeGreaterThan(0);
    expect(emittedLogs.some((log) => log.includes('[REDACTED]'))).toBe(true);
    for (const log of emittedLogs) {
      expect(log).not.toContain(secretKey);
    }
    expect(record.result?.warnings?.[0]).toContain('[REDACTED]');
    expect(record.result?.warnings?.[0]).not.toContain(secretKey);
    // Test error redaction on throw
    const failOptions: RunManagerOptions = {
      ...options,
      reportExecutor: async () => {
        throw new Error(`Auth failed with secret ${secretKey}`);
      },
    };
    const failRecord = createMockRecord('run-5', entry.etag, 'report');
    await expect(executeControlRun(failRecord, failOptions, () => {})).rejects.toThrow();
    try {
      await executeControlRun(failRecord, failOptions, () => {});
    } catch (err: any) {
      expect(err.message).not.toContain(secretKey);
      expect(err.message).toContain('[REDACTED]');
    }
  });

  test('createRunManager end-to-end integration injects secrets and redacts logs', async () => {
    const configStore = await createConfigStore(configRoot);
    const secretStore = await createSecretStore(configRoot);
    const secretVal = 'e2e-super-secret-key-10101';
    await secretStore.putSecrets({ JENKINS_USER: 'e2e-user', JENKINS_PASS: secretVal });

    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const runManager = createRunManager({
      configStore,
      secretStore,
      reportRoot,
      env: {},
      reportExecutor: async (_p, deps) => {
        capturedEnv = deps?.runtimeEnvironment;
        return createMockReportResult(reportRoot, [`Pipeline warning: ${secretVal}`]);
      },
    });

    const entry = await configStore.readConfig('default.json');
    const started = await runManager.startRun({ configName: 'default.json', configEtag: entry.etag, runType: 'report' });
    const run = await waitForRunCompletion(runManager, started.id);

    expect(run?.status).toBe('succeeded');
    expect(capturedEnv?.JENKINS_USER).toBe('e2e-user');
    expect(capturedEnv?.JENKINS_PASS).toBe(secretVal);
    for (const log of run?.logs ?? []) {
      expect(log.message).not.toContain(secretVal);
    }
    expect(run?.result?.warnings?.[0]).toContain('[REDACTED]');
    expect(run?.result?.warnings?.[0]).not.toContain(secretVal);
  });

  test('derives workerCount from saved config document reportWorkers for report run (absent -> 1, 1 -> 1, 4 -> 4)', async () => {
    const configStore = await createConfigStore(configRoot);
    let capturedDeps: RunnerDependencies | undefined;
    const options: RunManagerOptions = {
      configStore,
      reportRoot,
      env: {},
      reportExecutor: async (_p, deps) => {
        capturedDeps = deps;
        return createMockReportResult(reportRoot);
      },
    };

    // 1. Absent reportWorkers in document -> defaults to 1
    const entryAbsent = await configStore.readConfig('default.json');
    const recordAbsent = createMockRecord('run-w-absent', entryAbsent.etag, 'report');
    await executeControlRun(recordAbsent, options, () => {});
    expect(recordAbsent.status).toBe('succeeded');
    expect(capturedDeps?.workerCount).toBe(1);

    // 2. Saved reportWorkers: 1 -> resolves to 1
    const config1 = { ...createValidConfig(reportRoot), reportWorkers: 1 };
    const entry1 = await configStore.writeConfig('default.json', config1, entryAbsent.etag);
    const record1 = createMockRecord('run-w-1', entry1.etag, 'report');
    await executeControlRun(record1, options, () => {});
    expect(record1.status).toBe('succeeded');
    expect(capturedDeps?.workerCount).toBe(1);

    // 3. Saved reportWorkers: 4 -> resolves to 4
    const config4 = { ...createValidConfig(reportRoot), reportWorkers: 4 };
    const entry4 = await configStore.writeConfig('default.json', config4, entry1.etag);
    const record4 = createMockRecord('run-w-4', entry4.etag, 'report');
    await executeControlRun(record4, options, () => {});
    expect(record4.status).toBe('succeeded');
    expect(capturedDeps?.workerCount).toBe(4);
  });

  test('auto-build run does not pass workerCount even when document has reportWorkers: 4', async () => {
    const configStore = await createConfigStore(configRoot);
    const configWithWorkers = { ...createValidConfig(reportRoot), reportWorkers: 4 };
    const initialEntry = await configStore.readConfig('default.json');
    const updatedEntry = await configStore.writeConfig('default.json', configWithWorkers, initialEntry.etag);

    let capturedBuildDeps: Record<string, unknown> | undefined;
    let reportCalled = false;
    const options: RunManagerOptions = {
      configStore,
      reportRoot,
      env: {},
      reportExecutor: async () => {
        reportCalled = true;
        return createMockReportResult(reportRoot);
      },
      autoBuildExecutor: async (project, deps) => {
        capturedBuildDeps = deps as Record<string, unknown>;
        return { projectId: project.id, projectName: project.name, state: 'submitted', jobUrl: project.jobUrl, exitCode: 0 };
      },
    };

    const record = createMockRecord('run-build-workers', updatedEntry.etag, 'auto-build', 'build-proj');
    await executeControlRun(record, options, () => {});

    expect(record.status).toBe('succeeded');
    expect(reportCalled).toBe(false);
    expect(capturedBuildDeps?.['workerCount']).toBeUndefined();
    expect(record.result?.buildState).toBe('submitted');
    expect(record.result?.reportUrl).toBeUndefined();
  });

  test('fails execution when config is modified between acceptance and executor read (stale ETag)', async () => {
    const configStore = await createConfigStore(configRoot);
    const entry = await configStore.readConfig('default.json');
    const staleRecord = createMockRecord('run-stale-etag', entry.etag, 'report');

    // Overwrite config on disk with new data to change its ETag
    const modifiedConfig = { ...createValidConfig(reportRoot), reportWorkers: 2 };
    await configStore.writeConfig('default.json', modifiedConfig, entry.etag);

    const options: RunManagerOptions = {
      configStore,
      reportRoot,
      env: {},
      reportExecutor: async () => createMockReportResult(reportRoot),
    };

    await expect(executeControlRun(staleRecord, options, () => {})).rejects.toThrow(
      'Config has been modified since run was requested',
    );
  });

  test('in-flight execution uses matched read entry even if config file is modified after matched read', async () => {
    const configStore = await createConfigStore(configRoot);
    const configWithWorkers = { ...createValidConfig(reportRoot), reportWorkers: 4 };
    const initialEntry = await configStore.readConfig('default.json');
    const entry = await configStore.writeConfig('default.json', configWithWorkers, initialEntry.etag);

    let executedWorkerCount: number | undefined;
    const options: RunManagerOptions = {
      configStore,
      reportRoot,
      env: {},
      reportExecutor: async (_p, deps) => {
        executedWorkerCount = deps?.workerCount;
        // Simulate concurrent file modification on disk while executor is running
        const freshEntry = await configStore.readConfig('default.json');
        const modifiedConfig = { ...createValidConfig(reportRoot), reportWorkers: 1 };
        await configStore.writeConfig('default.json', modifiedConfig, freshEntry.etag);
        return createMockReportResult(reportRoot);
      },
    };

    const record = createMockRecord('run-inflight', entry.etag, 'report');
    await executeControlRun(record, options, () => {});

    expect(record.status).toBe('succeeded');
    // In-flight run used the matched read entry with reportWorkers: 4
    expect(executedWorkerCount).toBe(4);
  });

  test('sets reportUrl to aggregate index when multiple report projects run, and to single project report when only one runs', async () => {
    const configStore = await createConfigStore(configRoot);

    // 1. Single report project: reportUrl points to that project's report
    const singleConfig = createValidConfig(reportRoot);
    fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(singleConfig), 'utf8');
    const entrySingle = await configStore.readConfig('default.json');
    const optionsSingle: RunManagerOptions = {
      configStore,
      reportRoot,
      env: {},
      reportExecutor: async () => ({
        ...createMockReportResult(reportRoot),
        aggregate: {
          schemaVersion: 3,
          generatedAt: new Date().toISOString(),
          projects: [
            {
              projectId: 'report-proj',
              name: 'Report Project',
              state: 'success',
              runId: 'mock-run',
              reportPath: 'report-proj/mock-run/index.html',
              runs: [],
              warnings: [],
            },
          ],
          warnings: [],
        },
      }),
    };

    const recordSingle = createMockRecord('run-single', entrySingle.etag, 'report');
    await executeControlRun(recordSingle, optionsSingle, () => {});
    expect(recordSingle.result?.reportUrl).toBe('/reports/report-proj/mock-run/index.html');

    // 2. Multiple report projects: reportUrl points to aggregate index /reports/index.html
    const baseProject = createValidConfig(reportRoot).projects[0]!;
    const multiConfig = {
      ...createValidConfig(reportRoot),
      projects: [
        baseProject,
        {
          ...baseProject,
          id: 'report-proj-2',
          name: 'Report Project 2',
          jobUrl: 'https://jenkins.example.com/job/report-proj-2/',
        },
      ],
    };
    fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify(multiConfig), 'utf8');
    const entryMulti = await configStore.readConfig('default.json');
    const optionsMulti: RunManagerOptions = {
      configStore,
      reportRoot,
      env: {},
      reportExecutor: async () => ({
        ...createMockReportResult(reportRoot),
        aggregate: {
          schemaVersion: 3,
          generatedAt: new Date().toISOString(),
          projects: [
            {
              projectId: 'report-proj',
              name: 'Report Project',
              state: 'success',
              runId: 'mock-run',
              reportPath: 'report-proj/mock-run/index.html',
              runs: [],
              warnings: [],
            },
            {
              projectId: 'report-proj-2',
              name: 'Report Project 2',
              state: 'success',
              runId: 'mock-run',
              reportPath: 'report-proj-2/mock-run/index.html',
              runs: [],
              warnings: [],
            },
          ],
          warnings: [],
        },
      }),
    };

    const recordMulti = createMockRecord('run-multi', entryMulti.etag, 'report');
    await executeControlRun(recordMulti, optionsMulti, () => {});
    expect(recordMulti.result?.reportUrl).toBe('/reports/index.html');
  });
});
