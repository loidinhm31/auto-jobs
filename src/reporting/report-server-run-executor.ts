import * as path from 'node:path';

import { redactText } from '../config-errors.js';
import type { ConfigStore } from './report-server-config-store.js';
import { normalizeProjectConfigDocument } from '../config/project-config-loader.js';
import {
  selectAutoBuildProject,
  selectAutoBuildProjects,
  selectReportProjects,
} from '../config/project-run-selection.js';
import { normalizeReportWorkerCount } from '../config/report-worker-count.js';
import { executeAutoBuildWorkerPool } from '../project/auto-build-worker-pool.js';
import { runAutoBuildProject, type AutoBuildRunOutcome } from '../project/auto-build-runner.js';
import type { StageViewStage } from '../jenkins/stage-view-types.js';
import { localReportHref } from './report-links.js';
import type { ControlRunRecord, RunManagerOptions } from './report-server-run-manager.js';

function sanitizeStage(stage: StageViewStage, secretValues: readonly string[]): StageViewStage {
  return {
    index: stage.index,
    name: redactText(stage.name, secretValues),
    status: redactText(stage.status, secretValues),
    duration: stage.duration ? redactText(stage.duration, secretValues) : undefined,
  };
}

function sanitizeAutoBuildOutcome(
  outcome: AutoBuildRunOutcome,
  secretValues: readonly string[],
): AutoBuildRunOutcome {
  return {
    projectId: outcome.projectId,
    projectName: redactText(outcome.projectName, secretValues),
    state: outcome.state,
    jobUrl: redactText(outcome.jobUrl, secretValues),
    buildPageUrl: outcome.buildPageUrl ? redactText(outcome.buildPageUrl, secretValues) : undefined,
    buildNumber: outcome.buildNumber ? redactText(outcome.buildNumber, secretValues) : undefined,
    buildResult: outcome.buildResult ? redactText(outcome.buildResult, secretValues) : undefined,
    stages: outcome.stages?.map((stage) => sanitizeStage(stage, secretValues)),
    submittedAt: outcome.submittedAt,
    responseStatus: outcome.responseStatus,
    error: outcome.error ? redactText(outcome.error, secretValues) : undefined,
    exitCode: outcome.exitCode,
  };
}

export async function executeControlRun(
  record: ControlRunRecord,
  options: RunManagerOptions,
  addLog: (msg: string) => void,
): Promise<void> {
  const { configStore, secretStore, reportRoot, reportExecutor, autoBuildExecutor, env = process.env } = options;
  let secretValues: readonly string[] = [];

  try {
    const storedSecrets = secretStore ? await secretStore.readSecrets() : {};
    secretValues = Object.values(storedSecrets).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    const safeAddLog = (msg: string) => addLog(redactText(msg, secretValues));
    const configEntry = await configStore.readConfig(record.configName);
    if (configEntry.etag !== record.configEtag) {
      throw new Error('Config has been modified since run was requested');
    }

    const runEnv: NodeJS.ProcessEnv = {
      ...env,
      ...storedSecrets,
    };

    const normalized = normalizeProjectConfigDocument(configEntry.document, runEnv);

    if (record.runType === 'report') {
      const reportProjects = selectReportProjects(normalized);
      const resolvedReportRoot = path.resolve(reportRoot);
      for (const proj of reportProjects) {
        if (path.resolve(proj.artifactDir) !== resolvedReportRoot) {
          throw new Error(`Project artifactDir '${proj.artifactDir}' does not match control report root`);
        }
      }
      safeAddLog(`Executing report for ${reportProjects.length} project(s)`);
      if (!reportExecutor) {
        throw new Error('reportExecutor is required for report run');
      }
      const workerCount = configEntry.document.reportWorkers ?? 1;
      const result = await reportExecutor(reportProjects, { runtimeEnvironment: runEnv, workerCount });

      const isMultiProject = reportProjects.length > 1;
      let reportUrl: string | undefined;

      if (isMultiProject) {
        reportUrl = '/reports/index.html';
      } else {
        const reportProject = result.aggregate.projects.find((p) => p.reportPath !== undefined);
        const relReport = reportProject?.reportPath ?? result.aggregate.projects[0]?.reportPath;
        const safeRelative = localReportHref(relReport);
        reportUrl = safeRelative
          ? `/reports/${safeRelative}`
          : result.exitCode === 0
            ? '/reports/index.html'
            : undefined;
      }

      record.status = result.exitCode === 0 ? 'succeeded' : 'failed';
      record.result = {
        reportUrl,
        warnings: result.warnings?.map((w) => redactText(w, secretValues)),
        error: result.exitCode !== 0 ? 'one or more projects reported failures' : undefined,
      };
      safeAddLog(`Report run finished with status: ${record.status}`);
    } else {
      const buildProjects =
        record.projectId === undefined
          ? selectAutoBuildProjects(normalized)
          : [selectAutoBuildProject(normalized, record.projectId)];

      const isSingle = buildProjects.length === 1;
      if (isSingle) {
        const buildProject = buildProjects[0]!;
        const shouldWait = record.waitForCompletion ?? buildProject.waitForCompletion;
        const effectiveWaitTimeoutMs = record.waitTimeoutMs ?? buildProject.waitTimeoutMs;
        safeAddLog(
          `Executing auto-build for project '${buildProject.id}' (${buildProject.jobUrl}) [waitForCompletion: ${shouldWait}${effectiveWaitTimeoutMs ? `, waitTimeoutMs: ${effectiveWaitTimeoutMs}` : ''}]`,
        );
      } else {
        safeAddLog(`Executing auto-build for ${buildProjects.length} project(s)`);
      }

      const workerCount = normalizeReportWorkerCount(configEntry.document.reportWorkers);
      const buildExecutor = autoBuildExecutor ?? runAutoBuildProject;

      const rawOutcomes = await executeAutoBuildWorkerPool({
        projects: buildProjects,
        workerCount,
        runtimeEnvironment: runEnv,
        waitForCompletion: record.waitForCompletion,
        waitTimeoutMs: record.waitTimeoutMs,
        onProgress: (projectId, msg) => {
          const prefix = isSingle ? '' : `[${projectId}] `;
          safeAddLog(`${prefix}${msg}`);
        },
        executeProject: buildExecutor,
      });

      const sanitizedOutcomes = rawOutcomes.map((outcome) =>
        sanitizeAutoBuildOutcome(outcome, secretValues),
      );

      const allSucceeded = sanitizedOutcomes.every((o) => o.exitCode === 0);
      record.status = allSucceeded ? 'succeeded' : 'failed';

      if (isSingle) {
        const single = sanitizedOutcomes[0]!;
        record.result = {
          buildProjects: sanitizedOutcomes,
          buildState: single.state,
          buildNumber: single.buildNumber,
          buildResult: single.buildResult,
          stages: single.stages,
          jobUrl: single.jobUrl,
          buildPageUrl: single.buildPageUrl,
          submittedAt: single.submittedAt,
          responseStatus: single.responseStatus,
          error: single.error,
        };
        safeAddLog(
          `Auto-build run finished with state: ${single.state}${single.buildResult ? ` (${single.buildResult})` : ''}`,
        );
      } else {
        record.result = {
          buildProjects: sanitizedOutcomes,
          error: allSucceeded ? undefined : 'one or more projects reported failures',
        };
        safeAddLog(
          `Auto-build run finished with status: ${record.status} (${sanitizedOutcomes.filter((o) => o.exitCode === 0).length}/${sanitizedOutcomes.length} succeeded)`,
        );
      }
    }
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const sanitizedMessage = redactText(rawMessage, secretValues);
    const error = new Error(sanitizedMessage);
    if (err instanceof Error && err.stack) {
      error.stack = redactText(err.stack, secretValues);
    }
    throw error;
  }
}
