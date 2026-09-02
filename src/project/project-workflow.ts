import type { Page } from '@playwright/test';

import { deriveJenkinsBaseUrl } from '../config-values.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import { openJenkinsJob, submitJenkinsLogin } from '../jenkins/auth.js';
import type { JenkinsRunnerConfig, JenkinsRunnerSelectors } from '../jenkins/runner-config.js';
import { boundedDiagnostics } from '../workflow/diagnostics.js';
import type { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import type { ProjectRunState } from './project-run-state.js';

export interface ProjectWorkflowResult {
  readonly jobUrl: string;
  readonly observedAt: string;
  readonly diagnostics?: {
    readonly lastSafeUrl?: string;
    readonly observationErrors: readonly string[];
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
    authLandmark: project.selectors.authLandmark,
    buildParametersLink: project.selectors.buildParametersLink,
    buildSubmitButton: project.selectors.buildSubmitButton,
  };
  return {
    baseUrl,
    loginUrl: project.loginUrl,
    jobUrl: project.jobUrl,
    username: secrets.username,
    password: secrets.password,
    selectors,
    timeoutMs: project.timeoutMs,
    browser: project.browser,
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
  const jobUrl = await openJenkinsJob(page, config, deadline);
  state.transition('job_opened');
  return {
    jobUrl,
    observedAt: new Date().toISOString(),
    diagnostics: {
      lastSafeUrl: jobUrl,
      observationErrors: boundedDiagnostics([]),
    },
  };
};
