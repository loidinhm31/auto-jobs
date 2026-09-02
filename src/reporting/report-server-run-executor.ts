import * as path from 'node:path';

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
  const { configStore, reportRoot, reportExecutor, autoBuildExecutor, env = process.env } = options;
  const configEntry = await configStore.readConfig(record.configName);
  if (configEntry.etag !== record.configEtag) {
    throw new Error('Config has been modified since run was requested');
  }

  const normalized = normalizeProjectConfigDocument(configEntry.document, env);

  if (record.runType === 'report') {
    const reportProjects = selectReportProjects(normalized);
    const resolvedReportRoot = path.resolve(reportRoot);
    for (const proj of reportProjects) {
      if (path.resolve(proj.artifactDir) !== resolvedReportRoot) {
        throw new Error(`Project artifactDir '${proj.artifactDir}' does not match control report root`);
      }
    }
    addLog(`Executing report for ${reportProjects.length} project(s)`);
    const executor = reportExecutor!;
    const result = await executor(reportProjects, { runtimeEnvironment: env });

    const relReport = result.aggregate.projects[0]?.reportPath;
    const safeRelative = localReportHref(relReport);
    const reportUrl = safeRelative ? `/reports/${safeRelative}` : '/reports/index.html';

    record.status = result.exitCode === 0 ? 'succeeded' : 'failed';
    record.result = {
      reportUrl,
      warnings: result.warnings,
      error: result.exitCode !== 0 ? 'one or more projects reported failures' : undefined,
    };
    addLog(`Report run finished with status: ${record.status}`);
  } else {
    if (!record.projectId) {
      throw new Error('projectId is required for auto-build run');
    }
    const buildProject = selectAutoBuildProject(normalized, record.projectId);
    addLog(`Executing auto-build for project '${buildProject.id}' (${buildProject.jobUrl})`);
    const executor = autoBuildExecutor!;
    const outcome = await executor(buildProject, { runtimeEnvironment: env });

    if (outcome.state === 'submitted') {
      record.status = 'succeeded';
    } else if (outcome.state === 'submission-unknown') {
      record.status = 'submission-unknown';
    } else {
      record.status = 'failed';
    }

    record.result = {
      buildState: outcome.state,
      jobUrl: outcome.jobUrl,
      buildPageUrl: outcome.buildPageUrl,
      submittedAt: outcome.submittedAt,
      responseStatus: outcome.responseStatus,
      error: outcome.error,
    };
    addLog(`Auto-build run finished with state: ${outcome.state}`);
  }
}
