import * as path from 'node:path';

import { redactText } from '../config-errors.js';
import { normalizeReportWorkerCount } from '../config/report-worker-count.js';
import { executeAutoBuildWorkerPool } from '../project/auto-build-worker-pool.js';
import { runAutoBuildProject, type AutoBuildRunOutcome } from '../project/auto-build-runner.js';
import { localReportHref } from './report-links.js';
import type { ControlRunRecord, RunManagerOptions } from './report-server-run-manager.js';
import type { ConfigFileEntry } from './report-server-config-store.js';
import {
  assertNoArtifactCollisions,
  resolveRunTargets,
  type ReportProjectRunOutcome,
} from './control-run-targets.js';

export async function executeMatrixRun(
  record: ControlRunRecord,
  options: RunManagerOptions,
  secretValues: readonly string[],
  safeAddLog: (msg: string) => void,
  configEntry: ConfigFileEntry,
  runEnv: NodeJS.ProcessEnv,
  sanitizeAutoBuildOutcome: (outcome: AutoBuildRunOutcome, secretValues: readonly string[]) => AutoBuildRunOutcome,
): Promise<void> {
  const { reportRoot, reportExecutor, autoBuildExecutor } = options;
  if (!record.targets) return;

  const { targets: resolvedTargets, skippedCoordinates } = resolveRunTargets(
    configEntry.document,
    record.targets,
    record.runType,
    runEnv,
  );

  if (skippedCoordinates.length > 0) {
    safeAddLog(`Skipped ${skippedCoordinates.length} empty or blank target cell(s)`);
  }

  if (record.runType === 'report') {
    await assertNoArtifactCollisions(reportRoot, resolvedTargets);
    const resolvedReportRoot = path.resolve(reportRoot);
    for (const target of resolvedTargets) {
      if (path.resolve(target.virtualProject.artifactDir) !== resolvedReportRoot) {
        throw new Error(
          `Project artifactDir '${target.virtualProject.artifactDir}' does not match control report root`,
        );
      }
    }

    const virtualProjects = resolvedTargets.map((t) => t.virtualProject);
    safeAddLog(`Executing report for ${virtualProjects.length} matrix target(s)`);
    if (!reportExecutor) {
      throw new Error('reportExecutor is required for report run');
    }
    const workerCount = configEntry.document.reportWorkers ?? 1;
    const result = await reportExecutor(virtualProjects, { runtimeEnvironment: runEnv, workerCount });

    const reportProjects: ReportProjectRunOutcome[] = resolvedTargets.map((target) => {
      const outcome = result.outcomes.find((o) => o.projectId === target.virtualProjectId);
      const aggProject = result.aggregate.projects.find((p) => p.projectId === target.virtualProjectId);
      const relReport = aggProject?.reportPath ?? outcome?.manifestPath;
      const safeRelative = localReportHref(relReport);
      const status =
        outcome?.state === 'success' || (outcome === undefined && result.exitCode === 0)
          ? 'success'
          : outcome?.state === 'partial'
            ? 'partial'
            : 'failed';

      return {
        targetId: target.virtualProjectId,
        projectId: target.sourceProjectId,
        projectName: redactText(target.sourceProjectName, secretValues),
        columnId: target.columnId,
        columnName: redactText(target.columnName, secretValues),
        jobUrl: redactText(target.jobUrl, secretValues),
        runId: outcome?.runId,
        status,
        reportUrl: safeRelative ? `/reports/${safeRelative}` : undefined,
        error: outcome?.error ? redactText(outcome.error, secretValues) : undefined,
        warnings: outcome?.warnings?.map((w) => redactText(w, secretValues)),
      };
    });

    record.status = result.exitCode === 0 ? 'succeeded' : 'failed';
    record.result = {
      reportUrl: '/reports/index.html',
      reportProjects,
      warnings: result.warnings?.map((w) => redactText(w, secretValues)),
      error: result.exitCode !== 0 ? 'one or more projects reported failures' : undefined,
    };
    safeAddLog(`Report run finished with status: ${record.status}`);
  } else {
    const virtualProjects = resolvedTargets.map((t) => t.virtualProject);
    safeAddLog(`Executing auto-build for ${virtualProjects.length} matrix target(s)`);

    const workerCount = normalizeReportWorkerCount(configEntry.document.reportWorkers);
    const buildExecutor = autoBuildExecutor ?? runAutoBuildProject;

    const rawOutcomes = await executeAutoBuildWorkerPool({
      projects: virtualProjects,
      workerCount,
      runtimeEnvironment: runEnv,
      waitForCompletion: record.waitForCompletion,
      waitTimeoutMs: record.waitTimeoutMs,
      onProgress: (projectId, msg) => {
        safeAddLog(`[${projectId}] ${msg}`);
      },
      executeProject: buildExecutor,
    });

    const annotatedOutcomes: AutoBuildRunOutcome[] = rawOutcomes.map((outcome, idx) => {
      const target =
        resolvedTargets.find((t) => t.virtualProjectId === outcome.projectId) ??
        resolvedTargets[idx];
      return {
        ...outcome,
        sourceProjectId: target?.sourceProjectId,
        sourceProjectName: target?.sourceProjectName,
        columnId: target?.columnId,
        columnName: target?.columnName,
      };
    });

    const sanitizedOutcomes = annotatedOutcomes.map((outcome) =>
      sanitizeAutoBuildOutcome(outcome, secretValues),
    );

    const allSucceeded = sanitizedOutcomes.every((o) => o.exitCode === 0);
    record.status = allSucceeded ? 'succeeded' : 'failed';
    record.result = {
      buildProjects: sanitizedOutcomes,
      error: allSucceeded ? undefined : 'one or more projects reported failures',
    };
    safeAddLog(
      `Auto-build run finished with status: ${record.status} (${sanitizedOutcomes.filter((o) => o.exitCode === 0).length}/${sanitizedOutcomes.length} succeeded)`,
    );
  }
}
