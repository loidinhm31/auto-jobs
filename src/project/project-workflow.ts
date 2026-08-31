import type { Page } from '@playwright/test';

import { deriveJenkinsBaseUrl } from '../config-values.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import { sanitizeUrl } from '../config-errors.js';
import { submitJenkinsLogin } from '../jenkins/auth.js';
import { resolveQueuedBuild, waitForTerminalBuild, type TerminalBuildResult } from '../jenkins/build.js';
import { resolveJenkinsJob } from '../jenkins/job.js';
import {
  DEFAULT_JENKINS_RUNNER_SELECTORS,
  type JenkinsRunnerConfig,
  type JenkinsRunnerSelectors,
} from '../jenkins/runner-config.js';
import { UiBuildTrigger } from '../jenkins/trigger.js';
import { parseQueueReference } from '../jenkins/url-identity.js';
import type { TriggerEvidence } from '../result-types.js';
import { assertAllowedUrl } from '../security/url-policy.js';
import { boundedDiagnostics } from '../workflow/diagnostics.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import type { ProjectRunState } from './project-run-state.js';

export interface ProjectWorkflowResult {
  readonly terminal: TerminalBuildResult;
  readonly trigger: TriggerEvidence;
  readonly diagnostics?: {
    readonly lastSafeUrl?: string;
    readonly status?: string;
    readonly observationErrors: readonly string[];
    readonly reloadCount: number;
  };
}

export type ProjectWorkflow = (
  page: Page,
  project: NormalizedProjectConfig,
  secrets: ProjectSecrets,
  deadline: WorkflowDeadline,
  state: ProjectRunState,
) => Promise<ProjectWorkflowResult>;


function runnerConfig(
  project: NormalizedProjectConfig,
  secrets: ProjectSecrets,
): JenkinsRunnerConfig {
  const baseUrl = deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl);
  const selectors: JenkinsRunnerSelectors = {
    trigger: DEFAULT_JENKINS_RUNNER_SELECTORS.trigger,
    authLandmark: project.selectors.authLandmark,
    queueUrl: DEFAULT_JENKINS_RUNNER_SELECTORS.queueUrl,
    buildStatus: DEFAULT_JENKINS_RUNNER_SELECTORS.buildStatus,
    buildUrl: DEFAULT_JENKINS_RUNNER_SELECTORS.buildUrl,
    sonarqubeReport: project.selectors.sonarqubeReport,
    snykReport: project.selectors.snykReport,
  };
  return {
    baseUrl,
    loginUrl: project.loginUrl,
    jobUrl: project.jobUrl,
    username: secrets.username,
    password: secrets.password,
    selectors,
    timeoutMs: project.timeoutMs,
    pollIntervalMs: 1_000,
    browser: project.browser,
    artifactDir: project.artifactDir,
  };
}

export const executeJenkinsWorkflow: ProjectWorkflow = async (
  page,
  project,
  secrets,
  deadline,
  state,
) => {
  const config = runnerConfig(project, secrets);
  await submitJenkinsLogin(page, config, deadline);
  state.transition('authenticated');
  const job = await resolveJenkinsJob(page, config, deadline);
  state.transition('job_resolved');

  const triggerResult = await new UiBuildTrigger(page, config, job, deadline).trigger();
  state.transition('capability_checked');
  if (triggerResult.capability === 'unsupported_parameterized') {
    state.transition('parameterized_failure');
    throw new Error('Parameterized Jenkins jobs are unsupported in V1');
  }
  state.transition('baseline_captured');
  state.transition('submitted');
  let build = triggerResult.build;
  if (build === undefined && triggerResult.queueUrl !== undefined) {
    const queue = parseQueueReference(triggerResult.queueUrl, config.baseUrl);
    if (queue === undefined) throw new Error('Correlated Jenkins queue identity is invalid');
    build = await resolveQueuedBuild(
      page,
      config,
      job,
      queue,
      triggerResult.baseline?.latestBuildNumber,
      deadline,
    );
  }
  if (build === undefined) throw new Error('Jenkins trigger did not resolve an exact build');
  state.transition('correlated');
  const trigger: TriggerEvidence = {
    capability: 'build_now',
    triggerAttempts: triggerResult.triggerAttempts,
    ...(triggerResult.baseline?.latestBuildNumber === undefined
      ? {}
      : { baselineBuildNumber: triggerResult.baseline.latestBuildNumber }),
    ...(triggerResult.queueUrl === undefined ? {} : { queueUrl: triggerResult.queueUrl }),
    build,
    ...(triggerResult.baseline?.capturedAt === undefined
      ? {}
      : { submittedAt: triggerResult.baseline.capturedAt }),
    correlatedAt: new Date().toISOString(),
    warnings: [...triggerResult.diagnostics.observationErrors],
  };

  state.bindBuild(build);
  state.transition('running');
  const terminal = await waitForTerminalBuild(page, config, job, build, deadline);
  state.transition('terminal');
  const lastSafeUrl = triggerResultLastSafeUrl(trigger, project);
  return {
    terminal,
    trigger,
    diagnostics: {
      ...(lastSafeUrl === undefined ? {} : { lastSafeUrl }),
      status: terminal.status,
      observationErrors: boundedDiagnostics([
        ...trigger.warnings,
        ...terminal.observationErrors,
      ]),
      reloadCount: terminal.reloadCount,
    },
  };
};

function triggerResultLastSafeUrl(trigger: TriggerEvidence, project: NormalizedProjectConfig): string | undefined {
  if (trigger.build === undefined) return undefined;
  try {
    return assertAllowedUrl(
      sanitizeUrl(trigger.build.url),
      deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl),
      [project.sourceOrigins.jenkins, ...project.sourceOrigins.snyk, ...project.sourceOrigins.sonarqube],
      'Jenkins build URL',
    );
  } catch { return undefined; }
}
