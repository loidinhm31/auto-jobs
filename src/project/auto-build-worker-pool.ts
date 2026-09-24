import type { NormalizedProjectConfig } from '../config/config-types.js';
import type { AutoBuildRunOutcome, AutoBuildRunnerDependencies } from './auto-build-runner.js';
import { runAutoBuildProject } from './auto-build-runner.js';

export type AutoBuildProjectExecutor = (
  project: NormalizedProjectConfig,
  deps?: AutoBuildRunnerDependencies,
) => Promise<AutoBuildRunOutcome>;

export interface AutoBuildWorkerPoolOptions {
  readonly projects: readonly NormalizedProjectConfig[];
  readonly workerCount: number;
  readonly runtimeEnvironment?: NodeJS.ProcessEnv | undefined;
  readonly waitForCompletion?: boolean | undefined;
  readonly waitTimeoutMs?: number | undefined;
  readonly onProgress?: ((projectId: string, message: string) => void) | undefined;
  readonly executeProject?: AutoBuildProjectExecutor | undefined;
}

export async function executeAutoBuildWorkerPool(
  options: AutoBuildWorkerPoolOptions,
): Promise<readonly AutoBuildRunOutcome[]> {
  const { projects, workerCount } = options;
  if (projects.length === 0) {
    return Object.freeze([]);
  }

  const safeWorkerCount = Number.isSafeInteger(workerCount) ? Math.max(1, workerCount) : 1;
  const loopCount = Math.max(1, Math.min(safeWorkerCount, projects.length));
  const outcomes: AutoBuildRunOutcome[] = new Array(projects.length);
  let nextIndex = 0;

  const execute = options.executeProject ?? runAutoBuildProject;

  const workerLoop = async (): Promise<void> => {
    while (true) {
      if (nextIndex >= projects.length) return;
      const index = nextIndex;
      nextIndex += 1;
      const project = projects[index];
      if (project === undefined) return;

      const shouldWait = options.waitForCompletion ?? project.waitForCompletion;
      const effectiveWaitTimeoutMs = options.waitTimeoutMs ?? project.waitTimeoutMs;

      const deps: AutoBuildRunnerDependencies = {
        ...(options.runtimeEnvironment === undefined
          ? {}
          : { runtimeEnvironment: options.runtimeEnvironment }),
        ...(shouldWait === undefined ? {} : { waitForCompletion: shouldWait }),
        ...(effectiveWaitTimeoutMs === undefined ? {} : { waitTimeoutMs: effectiveWaitTimeoutMs }),
        ...(options.onProgress === undefined
          ? {}
          : {
              onProgress: (message: string) => {
                try {
                  options.onProgress?.(project.id, message);
                } catch {
                  // isolate progress callback errors from worker loop
                }
              },
            }),
      };

      try {
        outcomes[index] = await execute(project, deps);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        outcomes[index] = {
          projectId: project.id,
          projectName: project.name,
          state: 'submission-unknown',
          jobUrl: project.jobUrl,
          exitCode: 1,
          error: errorMsg,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: loopCount }, () => workerLoop()));

  for (let index = 0; index < projects.length; index += 1) {
    if (outcomes[index] === undefined) {
      throw new Error(`Auto-build worker pool failed to populate outcome slot ${index}`);
    }
  }

  return Object.freeze(outcomes);
}
