import { chromium, firefox, webkit, type Browser } from '@playwright/test';
import { formatDiagnostic } from './config-errors.js';

import { ArtifactPaths } from './artifacts/artifact-paths.js';
import { discoverRunManifests } from './artifacts/aggregate-manifest-reader.js';
import { writeAggregateData } from './artifacts/result-writer.js';
import { recoverAggregatePublication } from './artifacts/aggregate-publication-recovery.js';
import { loadProjectConfig } from './config/project-config-loader.js';
import type { NormalizedProjectConfig } from './config/config-types.js';
import type { AggregateProjectSummary, AggregateReportResult, AggregateRunSummary } from './result-types.js';
import { runProject, type ProjectRunnerDependencies } from './project/project-runner.js';
import type { ProjectOutcome, RunnerExecutionResult } from './project/project-types.js';
import type { BrowserName } from './types.js';

type BrowserLauncher = (browserName: BrowserName, environment?: NodeJS.ProcessEnv) => Promise<Browser>;
type ProjectExecutor = (
  project: NormalizedProjectConfig,
  dependencies: ProjectRunnerDependencies,
) => Promise<ProjectOutcome>;

export interface RunnerDependencies {
  readonly runtimeEnvironment?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly runIdSuffix?: () => string;
  readonly launchBrowser?: BrowserLauncher;
  readonly executeProject?: ProjectExecutor;
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

function launchOptions(environment: NodeJS.ProcessEnv): { executablePath?: string; headless?: boolean } {
  const executablePath = environment['PLAYWRIGHT_EXECUTABLE_PATH']?.trim();
  const headlessValue = environment['PLAYWRIGHT_HEADLESS']?.trim().toLowerCase();
  let headless: boolean | undefined;
  if (headlessValue !== undefined && headlessValue !== '') {
    if (['1', 'true', 'yes'].includes(headlessValue)) headless = true;
    else if (['0', 'false', 'no'].includes(headlessValue)) headless = false;
    else throw new Error('PLAYWRIGHT_HEADLESS must be true or false');
  }
  return {
    ...(executablePath === undefined || executablePath === '' ? {} : { executablePath }),
    ...(headless === undefined ? {} : { headless }),
  };
}

async function defaultLaunch(browserName: BrowserName, environment: NodeJS.ProcessEnv = process.env): Promise<Browser> {
  if (browserName === 'firefox') return firefox.launch();
  if (browserName === 'webkit') return webkit.launch();
  return chromium.launch(launchOptions(environment));
}

function aggregateSummary(
  outcome: ProjectOutcome,
  historical: readonly {
    relativeDirectory: string;
    projectId: string;
    buildNumber: number | 'pre-build';
    runId: string;
    state: 'success' | 'partial' | 'failed';
    warnings: readonly string[];
    reportPath?: string;
  }[],
): AggregateProjectSummary {
  const runs: AggregateRunSummary[] = historical
    .filter((item) => item.projectId === outcome.projectId)
    .map((item) => ({
      buildNumber: item.buildNumber,
      runId: item.runId,
      state: item.state,
      manifestPath: `${item.relativeDirectory}/manifest.json`,
      ...(item.reportPath === undefined ? {} : { reportPath: item.reportPath }),
      warnings: [...item.warnings],
    }));
  const reportPath = runs.find((run) => run.runId === outcome.runId &&
    (outcome.buildNumber === undefined ? run.buildNumber === 'pre-build' : run.buildNumber === outcome.buildNumber))?.reportPath;
  return {
    projectId: outcome.projectId,
    name: outcome.name,
    state: outcome.state,
    ...(outcome.buildNumber === undefined ? {} : { buildNumber: outcome.buildNumber }),
    runId: outcome.runId,
    ...(reportPath === undefined ? {} : { reportPath }),
    runs,
    warnings: [...outcome.warnings, ...(outcome.error === undefined ? [] : [outcome.error])],
  };
}

async function publishPreBuildOutcome(
  project: NormalizedProjectConfig,
  outcome: ProjectOutcome,
  artifacts: ArtifactPaths,
): Promise<ProjectOutcome> {
  if (outcome.state !== 'failed' || outcome.buildNumber !== undefined || outcome.manifestPath === undefined) return outcome;
  try {
    const published = await artifacts.publishPreBuild(project.id, outcome.runId);
    return { ...outcome, reportDirectory: published.directory, manifestPath: published.manifestPath };
  } catch (error) {
    return {
      ...outcome,
      warnings: [...outcome.warnings, 'pre-build failure artifact publication failed'],
      error: `${outcome.error ?? 'pre-build failure'}; ${formatDiagnostic(error)}`,
    };
  }
}

export async function runConfiguredProjects(
  projects: readonly NormalizedProjectConfig[],
  dependencies: RunnerDependencies = {},
  initialWarnings: readonly string[] = [],
): Promise<RunnerExecutionResult> {
  const config = enabledConfiguration(projects);
  const artifacts = new ArtifactPaths(config.reportRoot);
  await artifacts.initialize();
  const reportLock = await artifacts.acquireReportRootLock();
  const outcomes: ProjectOutcome[] = [];
  const runtimeWarnings: string[] = [];
  try {
    await recoverAggregatePublication(config.reportRoot);
    const initialCleanup = await artifacts.cleanupOrphans();
    runtimeWarnings.push(...initialCleanup.warnings);
    const browser = await (dependencies.launchBrowser ?? defaultLaunch)(config.browserName, dependencies.runtimeEnvironment);
    try {
      for (const project of config.projects) {
        try {
          const outcome = await (dependencies.executeProject ?? runProject)(project, {
            browser,
            artifacts,
            ...(dependencies.runtimeEnvironment === undefined ? {} : { ['env']: dependencies.runtimeEnvironment }),
            ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
            ...(dependencies.runIdSuffix === undefined ? {} : { runIdSuffix: dependencies.runIdSuffix }),
          });
          outcomes.push(await publishPreBuildOutcome(project, outcome, artifacts));
        } catch (error) {
          outcomes.push({
            projectId: project.id,
            name: project.name,
            state: 'failed',
            runId: 'unallocated',
            warnings: [],
            error: 'project execution failed before a run artifact was allocated',
          });
        }
      }
    } finally {
      try {
        await browser.close();
      } catch { runtimeWarnings.push('browser close failed after project execution'); }
    }

    const finalCleanup = await artifacts.cleanupOrphans();
    runtimeWarnings.push(...finalCleanup.warnings);
    const discovery = await discoverRunManifests(config.reportRoot);
    const historical = discovery.manifests.map((item) => ({
      relativeDirectory: item.relativeDirectory,
      projectId: item.manifest.project.id,
      buildNumber: item.manifest.jenkins?.buildNumber ?? 'pre-build' as const,
      runId: item.manifest.run.runId,
      state: item.manifest.state,
      warnings: item.manifest.warnings,
      ...(item.reportPath === undefined ? {} : { reportPath: item.reportPath }),
    }));
    const configuredIds = new Set(config.projects.map((project) => project.id));
    const orphanWarnings = historical.some((item) => !configuredIds.has(item.projectId))
      ? ['ignored historical manifests for unconfigured projects']
      : [];
    const warnings = [...initialWarnings, ...runtimeWarnings, ...discovery.warnings, ...orphanWarnings];
    const aggregate: AggregateReportResult = {
      schemaVersion: 2,
      generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      projects: outcomes.map((outcome) => aggregateSummary(outcome, historical)),
      warnings,
    };
    await writeAggregateData(config.reportRoot, aggregate);
    return {
      reportRoot: config.reportRoot,
      outcomes,
      aggregate,
      manifests: discovery.manifests,
      warnings,
      exitCode: outcomes.some((outcome) => outcome.state === 'failed') ? 1 : 0,
    };
  } finally {
    await reportLock.release();
  }
}

export async function runFromConfig(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Omit<RunnerDependencies, 'runtimeEnvironment'> = {},
): Promise<RunnerExecutionResult> {
  const projects = loadProjectConfig(filePath, env);
  return runConfiguredProjects(projects, { ...dependencies, runtimeEnvironment: env });
}
