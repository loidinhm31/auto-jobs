import type { Browser, Page } from '@playwright/test';

import { formatDiagnostic, sanitizeUrl } from '../config-errors.js';
import { resolveProjectSecrets } from '../config.js';
import { assertAllowedUrl } from '../security/url-policy.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import type { ArtifactPaths } from '../artifacts/artifact-paths.js';
import { createRunId } from '../artifacts/artifact-paths.js';
import type { ProjectFailureResultV2 } from '../artifacts/artifact-manifest.js';
import { writeFailureResult, writeProjectResult } from '../artifacts/result-writer.js';
import type { VulnerabilityReportResultV2 } from '../result-types.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { ProjectRunState } from './project-run-state.js';
import { createProjectManifest } from './project-manifest.js';
import { defaultCapture, outcomeState, sanitizeCaptureResult, sanitizeProjectDiagnostics, type CaptureResult, type EvidenceCapture } from './project-capture.js';
import type { ProjectOutcome } from './project-types.js';
import { executeJenkinsWorkflow, type ProjectWorkflow, type ProjectWorkflowResult } from './project-workflow.js';

export type { CaptureResult, EvidenceCapture } from './project-capture.js';

export interface ProjectRunnerDependencies {
  readonly browser: Pick<Browser, 'newContext'>;
  readonly artifacts: ArtifactPaths;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly now?: () => Date;
  readonly runIdSuffix?: () => string;
  readonly workflow?: ProjectWorkflow;
  readonly capture?: EvidenceCapture;
}

function safePageUrl(page: Page | undefined, project: NormalizedProjectConfig): string | undefined {
  if (page === undefined) return undefined;
  try {
    return assertAllowedUrl(
      sanitizeUrl(page.url()),
      project.baseUrl,
      [project.sourceOrigins.jenkins, ...project.sourceOrigins.snyk, ...project.sourceOrigins.sonarqube],
      'diagnostic page URL',
    );
  } catch { return undefined; }
}

export async function runProject(
  project: NormalizedProjectConfig,
  dependencies: ProjectRunnerDependencies,
): Promise<ProjectOutcome> {
  const now = dependencies.now ?? (() => new Date());
  const runId = createRunId(now(), dependencies.runIdSuffix?.());
  const stagingDirectory = await dependencies.artifacts.allocateStaging(project.id, runId);
  const state = new ProjectRunState({ projectId: project.id, projectName: project.name, runId, stagingDirectory });
  let outputDirectory = stagingDirectory;
  let reportDirectory: string | undefined;
  let context: Awaited<ReturnType<typeof dependencies.browser.newContext>> | undefined;
  let page: Page | undefined;
  let secrets: { username: string; password: string } | undefined;
  let workflowResult: ProjectWorkflowResult | undefined;
  let captureResult: CaptureResult | undefined;
  let diagnostics: ProjectWorkflowResult['diagnostics'];
  let failure: string | undefined;

  try {
    const resolved: ProjectSecrets = resolveProjectSecrets(project, dependencies.env);
    secrets = { username: resolved.username, password: resolved.password };
    context = await dependencies.browser.newContext();
    page = await context.newPage();
    const deadline = new WorkflowDeadline(project.timeoutMs);
    workflowResult = await (dependencies.workflow ?? executeJenkinsWorkflow)(page, project, secrets, deadline, state);
    diagnostics = workflowResult.diagnostics;
    if (secrets !== undefined) diagnostics = sanitizeProjectDiagnostics(diagnostics, secrets);
    const build = workflowResult.terminal.build;
    state.bindBuild(build);
    reportDirectory = await dependencies.artifacts.allocateReport(project.id, build.number, runId);
    outputDirectory = reportDirectory;
    const captured = await (dependencies.capture ?? defaultCapture)({
      page, project, workflow: workflowResult, deadline, outputDirectory,
    });
    captureResult = sanitizeCaptureResult(captured, resolved);
    state.transition('captured');
  } catch (error) {
    failure = formatDiagnostic(error, secrets === undefined ? [] : [secrets.username, secrets.password]);
    if (diagnostics === undefined) {
      const lastSafeUrl = safePageUrl(page, project);
      diagnostics = {
        ...(lastSafeUrl === undefined ? {} : { lastSafeUrl }),
        observationErrors: failure === undefined ? [] : [failure],
        reloadCount: 0,
      };
    }
  } finally {
    if (context !== undefined) {
      try { await context.close(); } catch (error) {
        failure ??= formatDiagnostic(error, secrets === undefined ? [] : [secrets.username, secrets.password]);
      }
    }
    if (secrets !== undefined) { secrets.username = ''; secrets.password = ''; secrets = undefined; }
  }

  if (failure !== undefined || workflowResult === undefined || captureResult === undefined) {
    const diagnostic = failure ?? 'Project workflow did not produce a result';
    if (state.phase !== 'failed') state.fail(diagnostic);
    const observedAt = now().toISOString();
    const failedManifest = createProjectManifest(project, state, 'failed', observedAt, [], diagnostic, diagnostics?.status, diagnostics);
    const failureResult: ProjectFailureResultV2 = {
      schemaVersion: 2, project: { id: project.id, name: project.name },
      run: { runId, observedAt }, state: 'failed',
      ...(state.build === undefined ? {} : { jenkins: {
        buildNumber: state.build.number, buildUrl: state.build.url,
      } }),
      diagnostic, warnings: [],
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
    const manifestPath = await writeFailureResult(outputDirectory, failureResult, failedManifest, dependencies.artifacts.reportRoot);
    return { projectId: project.id, name: project.name, state: 'failed', runId,
      ...(state.build === undefined ? {} : { buildNumber: state.build.number }), manifestPath,
      ...(reportDirectory === undefined ? {} : { reportDirectory }), warnings: [], error: diagnostic };
  }

  const resultState = outcomeState(captureResult);
  const result: VulnerabilityReportResultV2 = {
    schemaVersion: 2, state: resultState, project: { id: project.id, name: project.name },
    run: { runId, observedAt: workflowResult.terminal.observedAt },
    jenkins: { baseUrl: project.baseUrl, jobPath: project.jobPath, jobUrl: project.jobUrl,
      buildNumber: workflowResult.terminal.build.number, buildUrl: workflowResult.terminal.build.url,
      status: workflowResult.terminal.status, trigger: workflowResult.trigger },
    navigation: captureResult.navigation, reports: captureResult.reports,
    warnings: [...captureResult.warnings],
  };
  const runManifest = createProjectManifest(
    project, state, resultState, result.run.observedAt, result.warnings, undefined,
    result.jenkins.status, diagnostics, captureResult.artifacts?.screenshots,
  );
  try {
    const manifestPath = await writeProjectResult(outputDirectory, result, runManifest, dependencies.artifacts.reportRoot);
    state.transition('rendered');
    return { projectId: project.id, name: project.name, state: resultState, runId,
      buildNumber: result.jenkins.buildNumber, manifestPath, reportDirectory: outputDirectory,
      warnings: result.warnings };
  } catch (error) {
    const diagnostic = formatDiagnostic(error);
    state.fail(diagnostic);
    const failureObservedAt = now().toISOString();
    const failureResult: ProjectFailureResultV2 = {
      schemaVersion: 2, project: { id: project.id, name: project.name },
      run: { runId, observedAt: failureObservedAt }, state: 'failed',
      jenkins: { buildNumber: result.jenkins.buildNumber, buildUrl: result.jenkins.buildUrl },
      diagnostic, warnings: result.warnings,
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
    const failedManifest = createProjectManifest(
      project, state, 'failed', failureObservedAt, result.warnings, diagnostic,
      result.jenkins.status, diagnostics, captureResult.artifacts?.screenshots,
    );
    const manifestPath = await writeFailureResult(outputDirectory, failureResult, failedManifest, dependencies.artifacts.reportRoot);
    return { projectId: project.id, name: project.name, state: 'failed', runId,
      buildNumber: result.jenkins.buildNumber, manifestPath, reportDirectory: outputDirectory,
      warnings: result.warnings, error: diagnostic };
  }
}
