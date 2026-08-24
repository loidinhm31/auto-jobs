import type { Page } from '@playwright/test';

import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import { sanitizeUrl, type RunnerConfig } from '../config.js';
import { loginToJenkins } from '../jenkins/auth.js';
import { openExistingBuild, resolveQueuedBuild, waitForTerminalBuild, type TerminalBuildResult } from '../jenkins/build.js';
import { resolveJenkinsJob } from '../jenkins/job.js';
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
): RunnerConfig {
  return {
    baseUrl: project.baseUrl,
    username: secrets.username,
    password: secrets.password,
    loginPath: project.loginPath,
    jobPath: project.jobPath,
    triggerMode: project.triggerMode,
    selectors: project.selectors,
    timeoutMs: project.timeoutMs,
    pollIntervalMs: project.pollIntervalMs,
    browser: project.browser,
    artifactDir: project.artifactDir,
    ...(project.buildNumber === undefined ? {} : { buildNumber: project.buildNumber }),
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
  await loginToJenkins(page, config, deadline);
  state.transition('authenticated');
  const job = await resolveJenkinsJob(page, config, deadline);
  state.transition('job_resolved');

  let build;
  let trigger: TriggerEvidence;
  if (project.buildNumber !== undefined) {
    build = await openExistingBuild(page, config, job, deadline);
    state.transition('existing_build_selected');
    trigger = {
      capability: 'existing_build',
      triggerAttempts: 0,
      build,
      warnings: [],
    };
  } else {
    const triggerResult = await new UiBuildTrigger(page, config, job, deadline).trigger();
    state.transition('capability_checked');
    if (triggerResult.capability === 'unsupported_parameterized') {
      state.transition('parameterized_failure');
      throw new Error('Parameterized Jenkins jobs are unsupported in V1');
    }
    state.transition('baseline_captured');
    state.transition('submitted');
    build = triggerResult.build;
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
    trigger = {
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
  }

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
      project.baseUrl,
      [project.sourceOrigins.jenkins, ...project.sourceOrigins.snyk, ...project.sourceOrigins.sonarqube],
      'Jenkins build URL',
    );
  } catch { return undefined; }
}
