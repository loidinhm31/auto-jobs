import type { BrowserContext, Browser, Page } from '@playwright/test';

import { formatDiagnostic, sanitizeUrl } from '../config-errors.js';
import { deriveJenkinsBaseUrl } from '../config-values.js';
import { resolveProjectSecrets } from '../config.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import { assertAllowedUrl } from '../security/url-policy.js';
import type { ArtifactPaths } from '../artifacts/artifact-paths.js';
import { createRunId } from '../artifacts/artifact-paths.js';
import type { ProjectFailureResultV3, ProjectRunManifest } from '../artifacts/artifact-manifest.js';
import { writeFailureResult, writeProjectResult } from '../artifacts/result-writer.js';
import type { VulnerabilityReportResultV3 } from '../result-types.js';
import { sanitizePersistedWarnings } from '../artifacts/result-validation.js';
import { CLEANUP_SETTLE_TIMEOUT_MS, WorkflowDeadline, withHardTimeout as withHardTimeoutOperation, withWorkflowDeadline, withWorkflowDeadlineAndLateResource, settleCleanup } from '../workflow/workflow-deadline.js';
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
  readonly configureContext?: (context: BrowserContext) => Promise<void>;
}

function safePageUrl(page: Page | undefined, project: NormalizedProjectConfig): string | undefined {
  if (page === undefined) return undefined;
  try {
    return assertAllowedUrl(
      sanitizeUrl(page.url()),
      deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl),
      [project.sourceOrigins.jenkins, ...project.sourceOrigins.snyk, ...project.sourceOrigins.sonarqube],
      'diagnostic page URL',
    );
  } catch { return undefined; }
}


const FAILURE_PERSISTENCE_FALLBACK_MS = 5_000;

interface FailurePersistenceResult {
  readonly manifestPath?: string;
  readonly warning?: string;
}

async function withHardTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('failure artifact persistence fallback timed out')), timeoutMs);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function persistFailureResult(
  directory: string,
  result: ProjectFailureResultV3,
  manifest: ProjectRunManifest,
  reportRoot: string,
  deadline: WorkflowDeadline,
): Promise<FailurePersistenceResult> {
  try {
    return { manifestPath: await writeFailureResult(directory, result, manifest, reportRoot, deadline) };
  } catch (error) {
    try {
      return {
        manifestPath: await withHardTimeout(
          () => writeFailureResult(directory, result, manifest, reportRoot),
          FAILURE_PERSISTENCE_FALLBACK_MS,
        ),
      };
    } catch (fallbackError) {
      return {
        warning: sanitizePersistedWarnings([
          `failure artifact persistence failed after ${formatDiagnostic(error)}; bounded fallback failed: ${formatDiagnostic(fallbackError)}`,
        ])[0] ?? 'failure artifact persistence failed',
      };
    }
  }
}

export async function runProject(
  project: NormalizedProjectConfig,
  dependencies: ProjectRunnerDependencies,
): Promise<ProjectOutcome> {
  const deadline = new WorkflowDeadline(project.timeoutMs);
  deadline.requireRemaining();
  const now = dependencies.now ?? (() => new Date());
  const runId = createRunId(now(), dependencies.runIdSuffix?.());
  let reportDirectory: string | undefined;
  let state: ProjectRunState | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let secrets: { username: string; password: string } | undefined;
  let workflowResult: ProjectWorkflowResult | undefined;
  let captureResult: CaptureResult | undefined;
  let diagnostics: ProjectWorkflowResult['diagnostics'];
  let failure: string | undefined;
  let preAllocationError: unknown;

  try {
    await dependencies.artifacts.allocateStaging(project.id, runId, deadline);
    reportDirectory = await dependencies.artifacts.allocateReport(project.id, runId, deadline);
    const projectState = new ProjectRunState({
      projectId: project.id,
      projectName: project.name,
      jobUrl: project.jobUrl,
      runId,
      runDirectory: reportDirectory,
    });
    state = projectState;
    deadline.requireRemaining();
    const resolved: ProjectSecrets = resolveProjectSecrets(project, dependencies.env);
    secrets = { username: resolved.username, password: resolved.password };
    const createdContext = await withWorkflowDeadlineAndLateResource(
      () => dependencies.browser.newContext(),
      deadline,
      (lateContext) => settleCleanup(() => lateContext.close()),
    );
    context = createdContext;
    if (dependencies.configureContext !== undefined) {
      await withWorkflowDeadline(() => dependencies.configureContext?.(createdContext) ?? Promise.resolve(), deadline);
    }
    deadline.requireRemaining();
    const createdPage = await withWorkflowDeadlineAndLateResource(
      () => createdContext.newPage(),
      deadline,
      (latePage) => settleCleanup(() => latePage.close()),
    );
    page = createdPage;
    deadline.requireRemaining();
    const completedWorkflow = await withWorkflowDeadline(
      () => (dependencies.workflow ?? executeJenkinsWorkflow)(createdPage, project, resolved, deadline, projectState),
      deadline,
    );
    workflowResult = completedWorkflow;
    diagnostics = sanitizeProjectDiagnostics(completedWorkflow.diagnostics, resolved);
    const captured = await withWorkflowDeadline(() => (dependencies.capture ?? defaultCapture)({
      page: createdPage,
      project,
      workflow: completedWorkflow,
      deadline,
      state: projectState,
      outputDirectory: projectState.identity.runDirectory,
      secrets: resolved,
    }), deadline);
    captureResult = sanitizeCaptureResult(captured, resolved);
    if (projectState.phase === 'job_opened') projectState.transition('links_discovered');
    if (projectState.phase === 'links_discovered') projectState.transition('captured');
  } catch (error) {
    failure = formatDiagnostic(error, secrets === undefined ? [] : [secrets.username, secrets.password]);
    if (diagnostics === undefined) {
      const lastSafeUrl = safePageUrl(page, project);
      diagnostics = {
        ...(lastSafeUrl === undefined ? {} : { lastSafeUrl }),
        observationErrors: failure === undefined ? [] : [failure],
      };
    }
    if (state === undefined || reportDirectory === undefined) preAllocationError = error;
  } finally {
    if (context !== undefined) {
      try {
        await withHardTimeoutOperation(
          () => context!.close(),
          CLEANUP_SETTLE_TIMEOUT_MS,
          'Jenkins context close exceeded workflow cleanup timeout',
        );
      } catch (error) {
        failure ??= formatDiagnostic(error, secrets === undefined ? [] : [secrets.username, secrets.password]);
      }
    }
    if (secrets !== undefined) { secrets.username = ''; secrets.password = ''; secrets = undefined; }
  }


  if (preAllocationError !== undefined || state === undefined || reportDirectory === undefined) {
    throw preAllocationError ?? new Error('Project workflow failed before a report artifact was allocated');
  }
  if (failure !== undefined || workflowResult === undefined || captureResult === undefined) {
    const diagnostic = failure ?? 'Project workflow did not produce a result';
    if (state.phase !== 'failed') state.fail(diagnostic);
    const observedAt = now().toISOString();
    const warnings = sanitizePersistedWarnings(captureResult?.warnings ?? []);
    const failedManifest = createProjectManifest(project, state, 'failed', observedAt, warnings, {
      ...(workflowResult === undefined ? {} : { jobUrl: workflowResult.jobUrl }),
      diagnostic,
      ...(diagnostics === undefined ? {} : { diagnostics }),
      ...(captureResult?.artifacts?.screenshots === undefined ? {} : { screenshots: captureResult.artifacts.screenshots }),
    });
    const failureResult: ProjectFailureResultV3 = {
      schemaVersion: 3,
      project: { id: project.id, name: project.name },
      run: { runId, observedAt },
      state: 'failed',
      ...(workflowResult === undefined ? {} : { jenkins: { jobUrl: workflowResult.jobUrl } }),
      diagnostic,
      warnings,
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
    const persistence = await persistFailureResult(reportDirectory, failureResult, failedManifest, dependencies.artifacts.reportRoot, deadline);
    const outcomeWarnings = sanitizePersistedWarnings([...warnings, ...(persistence.warning === undefined ? [] : [persistence.warning])]);
    return {
      projectId: project.id,
      name: project.name,
      state: 'failed',
      runId,
      ...(persistence.manifestPath === undefined ? {} : { manifestPath: persistence.manifestPath }),
      reportDirectory,
      warnings: outcomeWarnings,
      error: diagnostic,
    };
  }

  const resultState = outcomeState(captureResult);
  const result: VulnerabilityReportResultV3 = {
    schemaVersion: 3,
    state: resultState,
    project: { id: project.id, name: project.name },
    run: { runId, observedAt: workflowResult.observedAt },
    jenkins: { jobUrl: workflowResult.jobUrl },
    navigation: captureResult.navigation,
    reports: captureResult.reports,
    warnings: [...captureResult.warnings],
  };
  const runManifest = createProjectManifest(
    project,
    state,
    resultState,
    result.run.observedAt,
    result.warnings,
    {
      jobUrl: result.jenkins.jobUrl,
      ...(diagnostics === undefined ? {} : { diagnostics }),
      ...(captureResult.artifacts?.screenshots === undefined ? {} : { screenshots: captureResult.artifacts.screenshots }),
    },
  );
  try {
    const manifestPath = await writeProjectResult(reportDirectory, result, runManifest, dependencies.artifacts.reportRoot, deadline);
    state.transition('rendered');
    return {
      projectId: project.id,
      name: project.name,
      state: resultState,
      runId,
      manifestPath,
      reportDirectory,
      warnings: result.warnings,
    };
  } catch (error) {
    const diagnostic = formatDiagnostic(error);
    state.fail(diagnostic);
    const failureWarnings = sanitizePersistedWarnings(result.warnings);
    const failureObservedAt = now().toISOString();
    const failureResult: ProjectFailureResultV3 = {
      schemaVersion: 3,
      project: { id: project.id, name: project.name },
      run: { runId, observedAt: failureObservedAt },
      state: 'failed',
      jenkins: { jobUrl: result.jenkins.jobUrl },
      diagnostic,
      warnings: failureWarnings,
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
    const failedManifest = createProjectManifest(
      project,
      state,
      'failed',
      failureObservedAt,
      failureWarnings,
      {
        jobUrl: result.jenkins.jobUrl,
        diagnostic,
        ...(diagnostics === undefined ? {} : { diagnostics }),
        ...(captureResult.artifacts?.screenshots === undefined ? {} : { screenshots: captureResult.artifacts.screenshots }),
      },
    );
    const persistence = await persistFailureResult(reportDirectory, failureResult, failedManifest, dependencies.artifacts.reportRoot, deadline);
    const outcomeWarnings = sanitizePersistedWarnings([...failureWarnings, ...(persistence.warning === undefined ? [] : [persistence.warning])]);
    return {
      projectId: project.id,
      name: project.name,
      state: 'failed',
      runId,
      ...(persistence.manifestPath === undefined ? {} : { manifestPath: persistence.manifestPath }),
      reportDirectory,
      warnings: outcomeWarnings,
      error: diagnostic,
    };
  }
}
