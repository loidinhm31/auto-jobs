import type { Browser, BrowserContext, Page } from '@playwright/test';

import { formatDiagnostic } from '../config-errors.js';
import { resolveProjectSecrets } from '../config/project-config-loader.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import { defaultLaunch, type BrowserLauncher } from '../browser-launcher.js';
import { executeJenkinsAutoBuildWorkflow, type AutoBuildWorkflowResult } from './project-workflow.js';
import { settleCleanup, WorkflowDeadline } from '../workflow/workflow-deadline.js';

export type AutoBuildOutcomeState =
  | 'submitted'
  | 'rejected'
  | 'submission-unknown'
  | 'failed-before-submit';

export interface AutoBuildRunOutcome {
  readonly projectId: string;
  readonly projectName: string;
  readonly state: AutoBuildOutcomeState;
  readonly jobUrl: string;
  readonly buildPageUrl?: string;
  readonly submittedAt?: string;
  readonly responseStatus?: number;
  readonly error?: string;
  readonly exitCode: 0 | 1;
}

export interface AutoBuildRunnerDependencies {
  readonly runtimeEnvironment?: NodeJS.ProcessEnv;
  readonly launchBrowser?: BrowserLauncher;
  readonly executeWorkflow?: (
    page: Page,
    project: NormalizedProjectConfig,
    secrets: ProjectSecrets,
    deadline: WorkflowDeadline,
  ) => Promise<AutoBuildWorkflowResult>;
  readonly configureContext?: (context: BrowserContext) => Promise<void>;
}

export async function runAutoBuildProject(
  project: NormalizedProjectConfig,
  dependencies: AutoBuildRunnerDependencies = {},
): Promise<AutoBuildRunOutcome> {
  const env = dependencies.runtimeEnvironment ?? process.env;
  let secrets: ProjectSecrets | undefined;
  let secretValues: string[] = [];
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    if (!project.enabled) {
      throw new Error(`Project '${project.id}' is disabled`);
    }
    if (project.runType !== 'auto-build') {
      throw new Error(`Project '${project.id}' is not configured for auto-build`);
    }

    secrets = resolveProjectSecrets(project, env);
    secretValues = [secrets.username, secrets.password].filter(Boolean);

    const deadline = new WorkflowDeadline(project.timeoutMs);
    deadline.requireRemaining();
    const launcher = dependencies.launchBrowser ?? defaultLaunch;
    browser = await launcher(project.browser, env);

    context = await browser.newContext();
    if (dependencies.configureContext !== undefined) {
      await dependencies.configureContext(context);
    }

    const page = await context.newPage();
    const workflow = dependencies.executeWorkflow ?? executeJenkinsAutoBuildWorkflow;
    const result = await workflow(page, project, secrets, deadline);

    if (result.state === 'submitted') {
      return {
        projectId: project.id,
        projectName: project.name,
        state: 'submitted',
        jobUrl: project.jobUrl,
        buildPageUrl: result.buildPageUrl,
        submittedAt: result.submittedAt,
        ...(result.responseStatus === undefined ? {} : { responseStatus: result.responseStatus }),
        exitCode: 0,
      };
    }

    return {
      projectId: project.id,
      projectName: project.name,
      state: result.state,
      jobUrl: project.jobUrl,
      buildPageUrl: result.buildPageUrl,
      submittedAt: result.submittedAt,
      ...(result.responseStatus === undefined ? {} : { responseStatus: result.responseStatus }),
      exitCode: 1,
    };
  } catch (error) {
    const safeError = formatDiagnostic(error, secretValues);
    return {
      projectId: project.id,
      projectName: project.name,
      state: 'failed-before-submit',
      jobUrl: project.jobUrl,
      error: safeError,
      exitCode: 1,
    };
  } finally {
    if (secrets !== undefined) {
      try {
        (secrets as unknown as Record<string, unknown>)['username'] = '';
        (secrets as unknown as Record<string, unknown>)['password'] = '';
      } catch {
        // Ignore if immutable
      }
    }
    if (context !== undefined) {
      await settleCleanup(() => context!.close());
    }
    if (browser !== undefined) {
      await settleCleanup(() => browser!.close());
    }
  }
}
