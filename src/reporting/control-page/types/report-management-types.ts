export interface AggregateRunSummary {
  runId: string;
  state: 'success' | 'partial' | 'failed';
  jobId?: string;
  branch?: string;
  manifestPath: string;
  reportPath?: string;
  warnings: string[];
}

export interface AggregateProjectSummary {
  projectId: string;
  name: string;
  state: 'success' | 'partial' | 'failed';
  runId?: string;
  reportPath?: string;
  runs: AggregateRunSummary[];
  warnings: string[];
}

export interface AggregateReportResult {
  schemaVersion: 3;
  generatedAt: string;
  projects: AggregateProjectSummary[];
  warnings: string[];
}

export interface ProjectDeletionResult {
  success: true;
  projectId: string;
  deletedRunsCount: number;
}

export interface RunDeletionResult {
  success: true;
  projectId: string;
  runId: string;
  remainingRunsCount: number;
}

export interface TargetRunToDelete {
  projectId: string;
  projectName: string;
  runId: string;
}
