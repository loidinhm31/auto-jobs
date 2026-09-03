import { setTimeout as sleep } from 'node:timers/promises';

import type { ControlRunRecord, RunManager } from '../../src/reporting/report-server-run-manager.js';
import type { RunnerExecutionResult } from '../../src/project/project-types.js';

export const createValidConfig = (artifactDir: string) => ({
  schemaVersion: 1,
  defaults: { artifactDir },
  projects: [
    {
      id: 'report-proj',
      name: 'Report Project',
      runType: 'report',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/report-proj/job/main/',
      credentials: {
        usernameVariable: 'JENKINS_USER',
        passwordVariable: 'JENKINS_PASS',
      },
    },
    {
      id: 'build-proj',
      name: 'Build Project',
      runType: 'auto-build',
      enabled: true,
      loginUrl: 'https://jenkins.example.com/login',
      jobUrl: 'https://jenkins.example.com/job/build-proj/job/main/',
      credentials: {
        usernameVariable: 'JENKINS_USER',
        passwordVariable: 'JENKINS_PASS',
      },
    },
  ],
});

export function createMockReportResult(
  reportRoot: string,
  warnings: string[] = [],
  exitCode: 0 | 1 = 0,
): RunnerExecutionResult {
  return {
    reportRoot,
    outcomes: [],
    aggregate: {
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      projects: [],
      warnings,
    },
    manifests: [],
    warnings,
    exitCode,
  };
}

export function createMockRecord(
  id: string,
  configEtag: string,
  runType: 'report' | 'auto-build',
  projectId?: string,
): ControlRunRecord {
  return {
    id,
    configName: 'default.json',
    configEtag,
    runType,
    ...(projectId ? { projectId } : {}),
    status: 'queued',
    queuedAt: new Date().toISOString(),
    logs: [],
  };
}

export async function waitForRunCompletion(
  runManager: RunManager,
  runId: string,
  maxAttempts = 30,
  intervalMs = 50,
): Promise<ControlRunRecord | undefined> {
  for (let i = 0; i < maxAttempts; i++) {
    const run = runManager.getRun(runId);
    if (run?.status === 'succeeded' || run?.status === 'failed') {
      return run;
    }
    await sleep(intervalMs);
  }
  return runManager.getRun(runId);
}
