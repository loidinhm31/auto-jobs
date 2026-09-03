import * as path from 'node:path';

import { redactText } from '../config-errors.js';
import type { ConfigStore } from './report-server-config-store.js';
import { normalizeProjectConfigDocument } from '../config/project-config-loader.js';
import { selectAutoBuildProject, selectReportProjects } from '../config/project-run-selection.js';
import { localReportHref } from './report-links.js';
import type { ControlRunRecord, RunManagerOptions } from './report-server-run-manager.js';

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
      const result = await reportExecutor(reportProjects, { runtimeEnvironment: runEnv });

      const relReport = result.aggregate.projects[0]?.reportPath;
      const safeRelative = localReportHref(relReport);
      const reportUrl = safeRelative ? `/reports/${safeRelative}` : '/reports/index.html';

      record.status = result.exitCode === 0 ? 'succeeded' : 'failed';
      record.result = {
        reportUrl,
        warnings: result.warnings?.map((w) => redactText(w, secretValues)),
        error: result.exitCode !== 0 ? 'one or more projects reported failures' : undefined,
      };
      safeAddLog(`Report run finished with status: ${record.status}`);
    } else {
      if (!record.projectId) {
        throw new Error('projectId is required for auto-build run');
      }
      if (!autoBuildExecutor) {
        throw new Error('autoBuildExecutor is required for auto-build run');
      }
      const buildProject = selectAutoBuildProject(normalized, record.projectId);
      safeAddLog(`Executing auto-build for project '${buildProject.id}' (${buildProject.jobUrl})`);
      const outcome = await autoBuildExecutor(buildProject, { runtimeEnvironment: runEnv });

      if (outcome.state === 'submitted') {
        record.status = 'succeeded';
      } else if (outcome.state === 'submission-unknown') {
        record.status = 'submission-unknown';
      } else {
        record.status = 'failed';
      }

      record.result = {
        buildState: outcome.state,
        jobUrl: outcome.jobUrl ? redactText(outcome.jobUrl, secretValues) : outcome.jobUrl,
        buildPageUrl: outcome.buildPageUrl ? redactText(outcome.buildPageUrl, secretValues) : outcome.buildPageUrl,
        submittedAt: outcome.submittedAt,
        responseStatus: outcome.responseStatus,
        error: outcome.error ? redactText(outcome.error, secretValues) : undefined,
      };
      safeAddLog(`Auto-build run finished with state: ${outcome.state}`);
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
