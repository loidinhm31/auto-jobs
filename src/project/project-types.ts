import type { AggregateReportResult } from '../result-types.js';
import type { DiscoveredRunManifest } from '../artifacts/artifact-manifest.js';

export type ProjectOutcomeState = 'success' | 'partial' | 'failed';

export interface ProjectRunIdentity {
  readonly projectId: string;
  readonly projectName: string;
  readonly jobUrl: string;
  readonly runId: string;
  readonly runDirectory: string;
}

export interface ProjectOutcome {
  readonly projectId: string;
  readonly name: string;
  readonly state: ProjectOutcomeState;
  readonly runId: string;
  readonly manifestPath?: string;
  readonly reportDirectory?: string;
  readonly warnings: readonly string[];
  readonly error?: string;
}

export interface RunnerExecutionResult {
  readonly reportRoot: string;
  readonly outcomes: readonly ProjectOutcome[];
  readonly aggregate: AggregateReportResult;
  readonly manifests: readonly DiscoveredRunManifest[];
  readonly warnings: readonly string[];
  readonly exitCode: 0 | 1;
}
