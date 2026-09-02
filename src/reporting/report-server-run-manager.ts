import { randomUUID } from 'node:crypto';

import { MAX_CONTROL_LOG_ENTRIES, MAX_CONTROL_LOG_LENGTH, MAX_RETAINED_RUNS } from './report-server-constants.js';
import type { ConfigStore } from './report-server-config-store.js';
import { runConfiguredProjects, type RunnerDependencies } from '../runner.js';
import { runAutoBuildProject, type AutoBuildRunnerDependencies } from '../project/auto-build-runner.js';
import type { NormalizedProjectConfig } from '../config/config-types.js';
import type { RunnerExecutionResult } from '../project/project-types.js';
import type { AutoBuildRunOutcome } from '../project/auto-build-runner.js';
import { executeControlRun } from './report-server-run-executor.js';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'submission-unknown';

export interface RunLogEntry {
  readonly timestamp: string;
  readonly message: string;
}

export interface ControlRunRecord {
  readonly id: string;
  readonly configName: string;
  readonly configEtag: string;
  readonly runType: 'report' | 'auto-build';
  readonly projectId?: string | undefined;
  status: RunStatus;
  readonly queuedAt: string;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  readonly logs: RunLogEntry[];
  result?: {
    readonly reportUrl?: string | undefined;
    readonly buildState?: string | undefined;
    readonly jobUrl?: string | undefined;
    readonly buildPageUrl?: string | undefined;
    readonly submittedAt?: string | undefined;
    readonly responseStatus?: number | undefined;
    readonly warnings?: readonly string[] | undefined;
    readonly error?: string | undefined;
  } | undefined;
}

export interface RunManagerOptions {
  readonly configStore: ConfigStore;
  readonly reportRoot: string;
  readonly reportExecutor?: ((projects: readonly NormalizedProjectConfig[], deps?: RunnerDependencies) => Promise<RunnerExecutionResult>) | undefined;
  readonly autoBuildExecutor?: ((project: NormalizedProjectConfig, deps?: AutoBuildRunnerDependencies) => Promise<AutoBuildRunOutcome>) | undefined;
  readonly idGenerator?: (() => string) | undefined;
  readonly clock?: (() => Date) | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
}

export interface StartRunParams {
  readonly configName: string;
  readonly configEtag: string;
  readonly runType: 'report' | 'auto-build';
  readonly projectId?: string | undefined;
}

export interface RunManager {
  startRun(params: StartRunParams): Promise<ControlRunRecord>;
  getRun(id: string): ControlRunRecord | undefined;
  getActiveRun(): ControlRunRecord | undefined;
}

function sanitizeLog(message: string): string {
  const singleLine = message.replace(/[\r\n]+/g, ' ').trim();
  return singleLine.length > MAX_CONTROL_LOG_LENGTH ? singleLine.slice(0, MAX_CONTROL_LOG_LENGTH) : singleLine;
}

export function createRunManager(options: RunManagerOptions): RunManager {
  const {
    reportExecutor = runConfiguredProjects,
    autoBuildExecutor = runAutoBuildProject,
    idGenerator = randomUUID,
    clock = () => new Date(),
  } = options;

  const resolvedOptions: RunManagerOptions = {
    ...options,
    reportExecutor,
    autoBuildExecutor,
  };

  let activeRun: ControlRunRecord | undefined;
  const history = new Map<string, ControlRunRecord>();

  function addLog(record: ControlRunRecord, message: string): void {
    if (record.logs.length >= MAX_CONTROL_LOG_ENTRIES) return;
    record.logs.push({
      timestamp: clock().toISOString(),
      message: sanitizeLog(message),
    });
  }

  function pruneHistory(): void {
    while (history.size > MAX_RETAINED_RUNS) {
      const oldestId = history.keys().next().value;
      if (oldestId !== undefined && activeRun?.id !== oldestId) {
        history.delete(oldestId);
      } else {
        break;
      }
    }
  }

  async function executeRun(record: ControlRunRecord): Promise<void> {
    record.status = 'running';
    record.startedAt = clock().toISOString();
    addLog(record, `Starting ${record.runType} run`);

    try {
      await executeControlRun(record, resolvedOptions, (msg) => addLog(record, msg));
    } catch (err) {
      record.status = 'failed';
      record.result = {
        error: err instanceof Error ? err.message : String(err),
      };
      addLog(record, `Run failed: ${record.result.error}`);
    } finally {
      record.finishedAt = clock().toISOString();
      activeRun = undefined;
      pruneHistory();
    }
  }

  async function startRun(params: StartRunParams): Promise<ControlRunRecord> {
    if (activeRun !== undefined) {
      throw new Error('A run is already in progress');
    }

    const id = idGenerator();
    const record: ControlRunRecord = {
      id,
      configName: params.configName,
      configEtag: params.configEtag,
      runType: params.runType,
      projectId: params.projectId,
      status: 'queued',
      queuedAt: clock().toISOString(),
      logs: [],
    };

    addLog(record, `Run accepted (type: ${params.runType})`);
    activeRun = record;
    history.set(id, record);

    // Start asynchronously
    void executeRun(record);

    return record;
  }

  function getRun(id: string): ControlRunRecord | undefined {
    return history.get(id);
  }

  function getActiveRun(): ControlRunRecord | undefined {
    return activeRun;
  }

  return {
    startRun,
    getRun,
    getActiveRun,
  };
}
