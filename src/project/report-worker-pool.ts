import type { Browser, BrowserContext } from '@playwright/test';

import type { ArtifactPaths } from '../artifacts/artifact-paths.js';
import type { NormalizedProjectConfig } from '../config/config-types.js';
import type { ProjectRunnerDependencies } from './project-runner.js';
import type { ProjectOutcome } from './project-types.js';
import { runProject } from './project-runner.js';

export type ProjectExecutor = (
  project: NormalizedProjectConfig,
  dependencies: ProjectRunnerDependencies,
) => Promise<ProjectOutcome>;

export interface WorkerPoolOptions {
  readonly projects: readonly NormalizedProjectConfig[];
  readonly workerCount: number;
  readonly browser: Browser;
  readonly artifacts: ArtifactPaths;
  readonly runtimeEnvironment?: NodeJS.ProcessEnv | undefined;
  readonly now?: (() => Date) | undefined;
  readonly runIdSuffix?: (() => string) | undefined;
  readonly configureContext?: ((context: BrowserContext) => Promise<void>) | undefined;
  readonly executeProject?: ProjectExecutor | undefined;
}

export async function executeProjectWorkerPool(
  options: WorkerPoolOptions,
): Promise<ProjectOutcome[]> {
  const { projects, workerCount, browser, artifacts } = options;
  const loopCount = Math.min(workerCount, projects.length);
  const outcomes: ProjectOutcome[] = new Array(projects.length);
  let nextIndex = 0;

  const projectDependencies: ProjectRunnerDependencies = {
    browser,
    artifacts,
    ...(options.runtimeEnvironment === undefined ? {} : { env: options.runtimeEnvironment }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.runIdSuffix === undefined ? {} : { runIdSuffix: options.runIdSuffix }),
    ...(options.configureContext === undefined ? {} : { configureContext: options.configureContext }),
  };

  const execute = options.executeProject ?? runProject;

  const workerLoop = async (): Promise<void> => {
    while (true) {
      if (nextIndex >= projects.length) return;
      const index = nextIndex;
      nextIndex += 1;
      const project = projects[index];
      if (project === undefined) return;
      try {
        outcomes[index] = await execute(project, projectDependencies);
      } catch {
        outcomes[index] = {
          projectId: project.id,
          name: project.name,
          state: 'failed',
          runId: 'unallocated',
          warnings: [],
          error: 'project execution failed before a run artifact was allocated',
        };
      }
    }
  };

  await Promise.all(Array.from({ length: loopCount }, () => workerLoop()));

  for (let index = 0; index < projects.length; index += 1) {
    if (outcomes[index] === undefined) {
      throw new Error(`Worker pool failed to populate outcome slot ${index}`);
    }
  }

  return outcomes;
}
