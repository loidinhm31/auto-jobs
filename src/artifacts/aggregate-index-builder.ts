import type { DiscoveredRunManifest, ManifestDiscoveryResult } from './artifact-manifest.js';
import type { ProjectOutcome } from '../project/project-types.js';
import type { AggregateProjectSummary, AggregateReportResult, AggregateRunSummary } from '../result-types.js';
import { jenkinsJobPathSegments } from '../jenkins/url-identity.js';
import { assertValidAggregateResult, sanitizePersistedWarnings } from './result-validation.js';

export interface BuildAggregateIndexOptions {
  readonly discovery: ManifestDiscoveryResult;
  readonly outcomes?: readonly ProjectOutcome[];
  readonly generatedAt?: string;
  readonly warnings?: readonly string[];
}

interface ProjectedHistoricalRun {
  readonly summary: AggregateRunSummary;
  readonly observedAt: string;
  readonly projectName: string;
}

function projectRun(item: DiscoveredRunManifest): ProjectedHistoricalRun {
  const jobSegments = item.manifest.jenkins?.jobUrl === undefined
    ? []
    : jenkinsJobPathSegments(item.manifest.jenkins.jobUrl);
  const rawJobId = jobSegments[2];
  const jobId = rawJobId === undefined || rawJobId.length > 256 ? undefined : rawJobId;
  const finalJobSegment = jobSegments.at(-1);
  const branch = jobSegments.length >= 4 && finalJobSegment !== rawJobId &&
    finalJobSegment !== undefined && finalJobSegment.length <= 256 ? finalJobSegment : undefined;
  return {
    summary: {
      runId: item.manifest.run.runId,
      state: item.manifest.state,
      ...(jobId === undefined ? {} : { jobId }),
      ...(branch === undefined ? {} : { branch }),
      manifestPath: `${item.relativeDirectory}/manifest.json`,
      ...(item.reportPath === undefined ? {} : { reportPath: item.reportPath }),
      warnings: sanitizePersistedWarnings(item.manifest.warnings),
    },
    observedAt: item.manifest.run.observedAt,
    projectName: item.manifest.project.name,
  };
}

function groupHistoricalRuns(
  manifests: readonly DiscoveredRunManifest[],
): Map<string, ProjectedHistoricalRun[]> {
  const grouped = new Map<string, Map<string, ProjectedHistoricalRun>>();
  for (const item of manifests) {
    const projectId = item.manifest.project.id;
    let projectRuns = grouped.get(projectId);
    if (projectRuns === undefined) {
      projectRuns = new Map();
      grouped.set(projectId, projectRuns);
    }
    if (!projectRuns.has(item.manifest.run.runId)) {
      projectRuns.set(item.manifest.run.runId, projectRun(item));
    }
  }

  const result = new Map<string, ProjectedHistoricalRun[]>();
  for (const [projectId, runsMap] of grouped) {
    const sorted = [...runsMap.values()].sort((left, right) => {
      const timeCompare = right.observedAt.localeCompare(left.observedAt);
      if (timeCompare !== 0) return timeCompare;
      return right.summary.runId.localeCompare(left.summary.runId);
    });
    result.set(projectId, sorted);
  }
  return result;
}

export function buildAggregateIndex(options: BuildAggregateIndexOptions): AggregateReportResult {
  if (options.discovery.incomplete) {
    throw new Error('cannot build aggregate index from incomplete manifest discovery');
  }

  const history = groupHistoricalRuns(options.discovery.manifests);
  const handledProjectIds = new Set<string>();
  const projects: AggregateProjectSummary[] = [];

  if (options.outcomes !== undefined) {
    for (const outcome of options.outcomes) {
      if (handledProjectIds.has(outcome.projectId)) continue;
      handledProjectIds.add(outcome.projectId);
      const historicalRuns = history.get(outcome.projectId) ?? [];
      const matchingRun = historicalRuns.find((r) => r.summary.runId === outcome.runId);
      const reportPath = matchingRun?.summary.reportPath;
      projects.push({
        projectId: outcome.projectId,
        name: outcome.name,
        state: outcome.state,
        runId: outcome.runId,
        ...(reportPath === undefined ? {} : { reportPath }),
        runs: historicalRuns.map((r) => r.summary),
        warnings: sanitizePersistedWarnings([
          ...outcome.warnings,
          ...(outcome.error === undefined ? [] : [outcome.error]),
        ]),
      });
    }
  }

  const historicalOnlyIds = [...history.keys()]
    .filter((id) => !handledProjectIds.has(id))
    .sort((a, b) => a.localeCompare(b));

  for (const projectId of historicalOnlyIds) {
    const historicalRuns = history.get(projectId) ?? [];
    const latest = historicalRuns[0];
    if (latest === undefined) continue;
    projects.push({
      projectId,
      name: latest.projectName,
      state: latest.summary.state,
      runId: latest.summary.runId,
      ...(latest.summary.reportPath === undefined ? {} : { reportPath: latest.summary.reportPath }),
      runs: historicalRuns.map((r) => r.summary),
      warnings: [],
    });
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const warnings = sanitizePersistedWarnings([
    ...(options.warnings ?? []),
    ...options.discovery.warnings,
  ]);

  const aggregate: AggregateReportResult = {
    schemaVersion: 3,
    generatedAt,
    projects,
    warnings,
  };

  assertValidAggregateResult(aggregate);
  return aggregate;
}
