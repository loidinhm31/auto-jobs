import { chromium, firefox, webkit, type Browser } from '@playwright/test';

import { ArtifactPaths } from './artifacts/artifact-paths.js';
import { discoverRunManifests } from './artifacts/aggregate-manifest-reader.js';
import { writeAggregateData } from './artifacts/result-writer.js';
import { parseProjectsConfig } from './config.js';
import type { NormalizedProjectConfig } from './config/config-types.js';
import type { AggregateProjectSummary, AggregateReportResult, AggregateRunSummary } from './result-types.js';
import { runProject, type ProjectRunnerDependencies } from './project/project-runner.js';
import type { ProjectOutcome, RunnerExecutionResult } from './project/project-types.js';
import type { BrowserName } from './types.js';

type BrowserLauncher = (browserName: BrowserName) => Promise<Browser>;
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

async function defaultLaunch(browserName: BrowserName): Promise<Browser> {
  if (browserName === 'firefox') return firefox.launch();
  if (browserName === 'webkit') return webkit.launch();
  return chromium.launch();
}

function aggregateSummary(
  outcome: ProjectOutcome,
  historical: readonly {
    relativeDirectory: string;
    projectId: string;
    buildNumber: number;
    runId: string;
    state: 'success' | 'partial' | 'failed';
    warnings: readonly string[];
  }[],
): AggregateProjectSummary {
  const relativeDirectory = outcome.buildNumber === undefined
    ? undefined
    : `${outcome.projectId}/${outcome.buildNumber}/${outcome.runId}`;
  const runs: AggregateRunSummary[] = historical
    .filter((item) => item.projectId === outcome.projectId)
    .map((item) => ({
      buildNumber: item.buildNumber,
      runId: item.runId,
      state: item.state,
      manifestPath: `${item.relativeDirectory}/manifest.json`,
      warnings: [...item.warnings],
    }));
  const reportPath = relativeDirectory !== undefined && runs.some((run) =>
    run.runId === outcome.runId && run.buildNumber === outcome.buildNumber)
    ? `${relativeDirectory}/manifest.json`
    : undefined;
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

export async function runConfiguredProjects(
  projects: readonly NormalizedProjectConfig[],
  dependencies: RunnerDependencies = {},
  initialWarnings: readonly string[] = [],
): Promise<RunnerExecutionResult> {
  const config = enabledConfiguration(projects);
  const artifacts = new ArtifactPaths(config.reportRoot);
  await artifacts.initialize();
  const browser = await (dependencies.launchBrowser ?? defaultLaunch)(config.browserName);
  const outcomes: ProjectOutcome[] = [];
  const runtimeWarnings: string[] = [];
  try {
    for (const project of config.projects) {
      try {
        outcomes.push(await (dependencies.executeProject ?? runProject)(project, {
          browser,
          artifacts,
          ...(dependencies.runtimeEnvironment === undefined ? {} : { ['env']: dependencies.runtimeEnvironment }),
          ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
          ...(dependencies.runIdSuffix === undefined ? {} : { runIdSuffix: dependencies.runIdSuffix }),
        }));
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
    try { await browser.close(); } catch { runtimeWarnings.push('browser close failed after project execution'); }
  }

  const discovery = await discoverRunManifests(config.reportRoot);
  const historical = discovery.manifests.map((item) => ({
    relativeDirectory: item.relativeDirectory,
    projectId: item.manifest.project.id,
    buildNumber: item.manifest.jenkins?.buildNumber ?? 0,
    runId: item.manifest.run.runId,
    state: item.manifest.state,
    warnings: item.manifest.warnings,
  })).filter((item) => item.buildNumber > 0);
  const configuredIds = new Set(config.projects.map((project) => project.id));
  const orphanWarnings = historical.some((item) => !configuredIds.has(item.projectId))
    ? ['ignored historical manifests for unconfigured projects']
    : [];
  const aggregate: AggregateReportResult = {
    schemaVersion: 2,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    projects: outcomes.map((outcome) => aggregateSummary(outcome, historical)),
  };
  await writeAggregateData(config.reportRoot, aggregate);
  const warnings = [...initialWarnings, ...runtimeWarnings, ...discovery.warnings, ...orphanWarnings];
  return {
    outcomes,
    aggregate,
    manifests: discovery.manifests,
    warnings,
    exitCode: outcomes.some((outcome) => outcome.state === 'failed') ? 1 : 0,
  };
}

export async function runFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Omit<RunnerDependencies, 'runtimeEnvironment'> = {},
): Promise<RunnerExecutionResult> {
  const loaded = parseProjectsConfig(env);
  return runConfiguredProjects(loaded.projects, { ...dependencies, runtimeEnvironment: env }, loaded.diagnostics);
}
