export type StageViewTerminalStatus = 'SUCCESS' | 'FAILED' | 'UNSTABLE' | 'ABORTED';

export type StageViewStatus = StageViewTerminalStatus | 'in-progress' | 'NOT_EXECUTED' | 'unknown';

export interface StageViewStage {
  readonly index: number;
  readonly name: string;
  readonly status: string;
  readonly duration?: string | undefined;
}

export interface StageViewRun {
  readonly runId: number;
  readonly buildNumber: string;
  readonly status: StageViewStatus;
  readonly stages: readonly StageViewStage[];
}

export interface WaitForStageViewOptions {
  readonly pollIntervalMs?: number;
  readonly reloadIntervalMs?: number;
  readonly lastDurationMs?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly onProgress?: ((message: string) => void) | undefined;
}

export interface StageViewCompletionResult {
  readonly completed: boolean;
  readonly run?: StageViewRun | undefined;
  readonly error?: string | undefined;
}
