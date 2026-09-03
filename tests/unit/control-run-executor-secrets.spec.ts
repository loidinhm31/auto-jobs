import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

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
});
