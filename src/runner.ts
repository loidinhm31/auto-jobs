import type { Browser, BrowserContext } from '@playwright/test';

import { ArtifactPaths } from './artifacts/artifact-paths.js';
import { discoverRunManifests } from './artifacts/aggregate-manifest-reader.js';
import { writeAggregateData } from './artifacts/result-writer.js';
import { recoverAggregatePublication } from './artifacts/aggregate-publication-recovery.js';
import { ensureStylesheet } from './reporting/report-output.js';
import { selectReportProjects } from './config/project-run-selection.js';
import { defaultLaunch, launchOptions, type BrowserLauncher } from './browser-launcher.js';

export { launchOptions };
import { loadProjectConfigWithDocument } from './config/project-config-loader.js';
import { normalizeReportWorkerCount } from './config/report-worker-count.js';
import type { NormalizedProjectConfig } from './config/config-types.js';
import type { AggregateReportResult } from './result-types.js';
import { buildAggregateIndex } from './artifacts/aggregate-index-builder.js';
import { type ProjectRunnerDependencies } from './project/project-runner.js';
import { executeProjectWorkerPool, type ProjectExecutor } from './project/report-worker-pool.js';
import type { ProjectOutcome, RunnerExecutionResult } from './project/project-types.js';
import type { BrowserName } from './types.js';
import { CLEANUP_SETTLE_TIMEOUT_MS, withHardTimeout } from './workflow/workflow-deadline.js';

export interface RunnerDependencies {
  readonly runtimeEnvironment?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly runIdSuffix?: () => string;
  readonly launchBrowser?: BrowserLauncher;
  readonly executeProject?: ProjectExecutor;
  readonly configureContext?: (context: BrowserContext) => Promise<void>;
  readonly workerCount?: number;
}

function enabledConfiguration(projects: readonly NormalizedProjectConfig[]): {
  projects: readonly NormalizedProjectConfig[];
  browserName: BrowserName;
  reportRoot: string;
} {
  const enabled = projects.filter((project) => project.enabled);
  const first = enabled[0];
  if (first === undefined) throw new Error('At least one project must be enabled');
  if (enabled.some((project) => project.browser !== first.browser)) {
    throw new Error('All enabled projects must use one browser in sequential V1 mode');
  }
  if (enabled.some((project) => project.artifactDir !== first.artifactDir)) {
    throw new Error('All enabled projects must use one global report output root');
  }
  return { projects: enabled, browserName: first.browser, reportRoot: first.artifactDir };
}


export async function runConfiguredProjects(
  projects: readonly NormalizedProjectConfig[],
  dependencies: RunnerDependencies = {},
  initialWarnings: readonly string[] = [],
): Promise<RunnerExecutionResult> {
  const workerCount = normalizeReportWorkerCount(dependencies.workerCount, 'workerCount');
  const seenIds = new Set<string>();
  for (const project of projects) {
    if (seenIds.has(project.id)) {
      throw new Error(`Duplicate project id: ${project.id}`);
    }
    seenIds.add(project.id);
  }
  const config = enabledConfiguration(projects);
  const artifacts = new ArtifactPaths(config.reportRoot);
  await artifacts.initialize();
  const reportLock = await artifacts.acquireReportRootLock();
  const outcomes: ProjectOutcome[] = [];
  const runtimeWarnings: string[] = [];
  try {
    await recoverAggregatePublication(config.reportRoot);
    await ensureStylesheet(config.reportRoot);
    const initialCleanup = await artifacts.cleanupOrphans();
    runtimeWarnings.push(...initialCleanup.warnings);
    const browser = await (dependencies.launchBrowser ?? defaultLaunch)(config.browserName, dependencies.runtimeEnvironment);
    try {
      const poolOutcomes = await executeProjectWorkerPool({
        projects: config.projects,
        workerCount,
        browser,
        artifacts,
        runtimeEnvironment: dependencies.runtimeEnvironment,
        now: dependencies.now,
        runIdSuffix: dependencies.runIdSuffix,
        configureContext: dependencies.configureContext,
        executeProject: dependencies.executeProject,
      });
      outcomes.push(...poolOutcomes);
    } finally {
      try {
        await withHardTimeout(
          () => browser.close(),
          CLEANUP_SETTLE_TIMEOUT_MS,
          'browser close exceeded workflow cleanup timeout',
        );
      } catch { runtimeWarnings.push('browser close failed after project execution'); }
    }

    const finalCleanup = await artifacts.cleanupOrphans();
    runtimeWarnings.push(...finalCleanup.warnings);
    const discovery = await discoverRunManifests(config.reportRoot);
    if (discovery.incomplete) {
      throw new Error('manifest discovery incomplete; skipping aggregate publication to protect historical index');
    }
    const aggregate = buildAggregateIndex({
      discovery,
      outcomes,
      generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      warnings: [...initialWarnings, ...runtimeWarnings],
    });
    await writeAggregateData(config.reportRoot, aggregate);
    return {
      reportRoot: config.reportRoot,
      outcomes,
      aggregate,
      manifests: discovery.manifests,
      warnings: aggregate.warnings,
      exitCode: outcomes.some((outcome) => outcome.state === 'failed') ? 1 : 0,
    };
  } finally {
    await reportLock.release();
  }
}

export async function runFromConfig(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Omit<RunnerDependencies, 'runtimeEnvironment' | 'workerCount'> = {},
): Promise<RunnerExecutionResult> {
  const { document, projects } = loadProjectConfigWithDocument(filePath, env);
  const reportProjects = selectReportProjects(projects);
  const { workerCount: _ignoredWorkerCount, ...restDependencies } = dependencies as RunnerDependencies;
  return runConfiguredProjects(reportProjects, {
    ...restDependencies,
    runtimeEnvironment: env,
    workerCount: document.reportWorkers ?? 1,
  });
}
