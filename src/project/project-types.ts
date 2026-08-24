import type { AggregateReportResult } from '../result-types.js';
import type { DiscoveredRunManifest } from '../artifacts/artifact-manifest.js';

export type ProjectOutcomeState = 'success' | 'partial' | 'failed';

export interface ProjectRunIdentity {
  readonly projectId: string;
  readonly projectName: string;
  readonly runId: string;
  readonly stagingDirectory: string;
}

export interface ProjectOutcome {
  readonly projectId: string;
  readonly name: string;
  readonly state: ProjectOutcomeState;
  readonly runId: string;
  readonly buildNumber?: number;
  readonly manifestPath?: string;
  readonly reportDirectory?: string;
  readonly warnings: readonly string[];
  readonly error?: string;
}

export interface RunnerExecutionResult {
  readonly outcomes: readonly ProjectOutcome[];
  readonly aggregate: AggregateReportResult;
  readonly manifests: readonly DiscoveredRunManifest[];
  readonly warnings: readonly string[];
  readonly exitCode: 0 | 1;
}
