import type { Page } from '@playwright/test';
import { normalizeProjectConfigDocument } from '../config/project-config-loader.js';
import { runProject } from '../project/project-runner.js';
import { defaultCapture } from '../project/project-capture.js';
import { openScriptSafePage } from '../reports/snyk/snyk-capture-support.js';
import type { SnykSummaryEvidence } from '../reports/snyk/snyk-capture-support.js';
import { MAX_SUMMARY_BYTES, parseSnykSummaryJson } from '../reports/snyk/snyk-summary-parser.js';
import { settleCleanup, withWorkflowDeadline, withWorkflowDeadlineAndLateResource, type WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { runConfiguredProjects } from '../runner.js';
import type { RunnerDependencies } from '../runner.js';
import type { RunnerExecutionResult } from '../project/project-types.js';
import {
  loadTemplateReportFixture,
  installTemplateReportRoutes,
  templateProjectDocument,
} from './template-report-fixture.js';

const TEMPLATE_USERNAME = 'template-fixture-user';
const TEMPLATE_PASSWORD = 'template-fixture-password';

async function readTemplateSnykSummary(
  page: Page,
  summaryUrl: string,
  deadline: WorkflowDeadline,
): Promise<SnykSummaryEvidence> {
  const summaryPage = await withWorkflowDeadlineAndLateResource(
    () => page.context().newPage(),
    deadline,
    (latePage) => settleCleanup(() => latePage.close()),
  );
  try {
    const response = await withWorkflowDeadline(
      () => summaryPage.goto(summaryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: deadline.requireRemaining(),
      }),
      deadline,
    );
    if (response === null || response.status() >= 400) {
      throw new Error(`Template Snyk summary returned HTTP ${response?.status() ?? 'no response'}`);
    }
    if (summaryPage.url() !== summaryUrl) throw new Error('Template Snyk summary navigation changed the exact URL');
    const body = await withWorkflowDeadline(() => summaryPage.locator('body').textContent(), deadline);
    if (body === null) throw new Error('Template Snyk summary body was unavailable');
    if (new TextEncoder().encode(body).byteLength > MAX_SUMMARY_BYTES) {
      throw new Error(`Template Snyk summary exceeds the ${MAX_SUMMARY_BYTES}-byte limit`);
    }
    return { parsed: parseSnykSummaryJson(body), url: summaryPage.url() };
  } finally {
    await settleCleanup(() => summaryPage.close());
  }
}

export async function runFromTemplates(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Omit<RunnerDependencies, 'runtimeEnvironment' | 'executeProject'> = {},
): Promise<RunnerExecutionResult> {
  const fixture = await loadTemplateReportFixture(env);
  const runtimeEnvironment: NodeJS.ProcessEnv = {
    ...env,
    TEMPLATE_FIXTURE_USERNAME: TEMPLATE_USERNAME,
    TEMPLATE_FIXTURE_PASSWORD: TEMPLATE_PASSWORD,
  };
  const projects = normalizeProjectConfigDocument(templateProjectDocument(env, fixture), runtimeEnvironment);
  const openSafePage = async (page: Page, deadline: WorkflowDeadline) => {
    const safeCapture = await openScriptSafePage(page, deadline);
    if (safeCapture.page.context() !== page.context()) {
      await installTemplateReportRoutes(safeCapture.page.context(), fixture);
    }
    return safeCapture;
  };
  return runConfiguredProjects(projects, {
    ...dependencies,
    runtimeEnvironment,
    configureContext: async (context) => {
      await installTemplateReportRoutes(context, fixture);
      await dependencies.configureContext?.(context);
    },
    executeProject: async (project, projectDependencies) => runProject(project, {
      ...projectDependencies,
      capture: async (captureInput) => defaultCapture({
        ...captureInput,
        snykSummaryReader: (summaryPage, summaryUrl, _project, summaryDeadline) =>
          readTemplateSnykSummary(summaryPage, summaryUrl, summaryDeadline),
        snykOpenSafePage: openSafePage,
      }),
    }),
  });
}
