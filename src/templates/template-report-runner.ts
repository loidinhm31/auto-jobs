import { normalizeProjectConfigDocument } from '../config/project-config-loader.js';
import { parsePositiveInteger } from '../config-values.js';
import { runProject } from '../project/project-runner.js';
import { defaultCapture } from '../project/project-capture.js';
import { parseSnykSummaryJson } from '../reports/snyk/snyk-summary-parser.js';
import type { SnykSummaryReader } from '../reports/snyk/snyk-capture.js';
import { openScriptSafePage } from '../reports/snyk/snyk-capture-support.js';
import type { RunnerDependencies } from '../runner.js';
import { runConfiguredProjects } from '../runner.js';
import type { RunnerExecutionResult } from '../project/project-types.js';
import {
  loadTemplateReportFixture,
  installTemplateReportRoutes,
  templateProjectDocument,
  templateWorkflow,
} from './template-report-fixture.js';

const TEMPLATE_USERNAME = 'template-fixture-user';
const TEMPLATE_PASSWORD = 'template-fixture-password';

function buildNumber(env: NodeJS.ProcessEnv): number {
  return parsePositiveInteger(env['TEMPLATE_BUILD_NUMBER']?.trim() || '1', 'TEMPLATE_BUILD_NUMBER');
}

export async function runFromTemplates(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Omit<RunnerDependencies, 'runtimeEnvironment' | 'executeProject'> = {},
): Promise<RunnerExecutionResult> {
  const fixture = await loadTemplateReportFixture(env, buildNumber(env));
  const runtimeEnvironment: NodeJS.ProcessEnv = {
    ...env,
    TEMPLATE_FIXTURE_USERNAME: TEMPLATE_USERNAME,
    TEMPLATE_FIXTURE_PASSWORD: TEMPLATE_PASSWORD,
  };
  const projects = normalizeProjectConfigDocument(templateProjectDocument(env, fixture), runtimeEnvironment);
  const workflow = templateWorkflow(fixture);
  const openSafePage = async (page: Parameters<typeof openScriptSafePage>[0]) => {
    const safeCapture = await openScriptSafePage(page);
    if (safeCapture.page.context() !== page.context()) {
      await installTemplateReportRoutes(safeCapture.page.context(), fixture);
    }
    return safeCapture;
  };
  const readSummary: SnykSummaryReader = async (_page, summaryUrl, _project, _deadline) => ({
    parsed: parseSnykSummaryJson(fixture.snykSummary),
    url: summaryUrl,
  });
  return runConfiguredProjects(projects, {
    ...dependencies,
    runtimeEnvironment,
    executeProject: async (project, projectDependencies) => runProject(project, {
      ...projectDependencies,
      workflow,
      capture: async (captureInput) => defaultCapture({
        ...captureInput,
        snykOpenSafePage: openSafePage,
        snykSummaryReader: readSummary,
      }),
    }),
  });
}
