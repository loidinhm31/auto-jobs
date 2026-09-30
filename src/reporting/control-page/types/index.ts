import type {
  BrowserName,
  RunType,
  SelectorConfig,
  SelectorOverrides,
  SourceName,
} from '../../../types.js';

export type { BrowserName, RunType, SelectorConfig, SelectorOverrides, SourceName };

import type {
  JobColumnInput,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectCredentialReferences,
  ProjectGroupInput,
  ProjectOriginPolicies,
  ProjectOriginSourceName,
  ProjectSourceInput,
} from '../../../config/config-types.js';

export type {
  JobColumnInput,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectCredentialReferences,
  ProjectGroupInput,
  ProjectOriginPolicies,
  ProjectOriginSourceName,
  ProjectSourceInput,
};

export interface ConfigSummary {
  name: string;
}

export interface ConfigFileListResponse {
  configs: ConfigSummary[];
}

export interface ConfigResponse {
  name: string;
  etag: string;
  document: ProjectConfigDocumentV1;
}

export type RunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'submission-unknown';

export interface RunLogEntry {
  timestamp: string;
  message: string;
}

export interface RunStageResult {
  readonly index: number;
  readonly name: string;
  readonly status: string;
  readonly duration?: string;
}
export interface RunTargetCoordinate {
  readonly projectId: string;
  readonly columnId: string;
}

export interface ReportProjectResult {
  readonly targetId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly columnId?: string | undefined;
  readonly columnName?: string | undefined;
  readonly jobUrl: string;
  readonly runId?: string | undefined;
  readonly status: string;
  readonly reportUrl?: string | undefined;
  readonly error?: string | undefined;
  readonly warnings?: readonly string[] | undefined;
}

export interface AutoBuildProjectResult {
  readonly projectId: string;
  readonly projectName: string;
  readonly state: string;
  readonly jobUrl: string;
  readonly columnId?: string | undefined;
  readonly columnName?: string | undefined;
  readonly sourceProjectId?: string | undefined;
  readonly sourceProjectName?: string | undefined;
  readonly buildPageUrl?: string | undefined;
  readonly buildNumber?: string | undefined;
  readonly buildResult?: string | undefined;
  readonly stages?: readonly RunStageResult[] | undefined;
  readonly submittedAt?: string | undefined;
  readonly responseStatus?: number | undefined;
  readonly error?: string | undefined;
  readonly exitCode: 0 | 1;
}

export interface RunResult {
  reportUrl?: string;
  buildState?: string;
  buildNumber?: string;
  buildResult?: string;
  stages?: readonly RunStageResult[];
  jobUrl?: string;
  buildPageUrl?: string;
  error?: string;
  buildProjects?: readonly AutoBuildProjectResult[];
  reportProjects?: readonly ReportProjectResult[];
  warnings?: readonly string[];
  [key: string]: unknown;
}

export interface RunRecord {
  id: string;
  status: RunStatus;
  logs: RunLogEntry[];
  result?: RunResult;
  configName?: string;
  configEtag?: string;
  runType?: RunType;
  projectId?: string;
  targets?: readonly RunTargetCoordinate[];
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RunStatusResponse {
  run: RunRecord;
}

export interface RunTriggerRequest {
  configName: string;
  configEtag: string;
  runType: RunType;
  projectId?: string;
  targets?: readonly RunTargetCoordinate[];
  waitForCompletion?: boolean;
  waitTimeoutMs?: number;
}

export interface RunTriggerResponse {
  id: string;
  status: 'queued' | 'running';
}

export interface SecretsPresenceMap {
  secrets: Record<string, boolean>;
}

export interface SaveSecretsRequest {
  secrets?: Record<string, string | null>;
  name?: string;
  value?: string | null;
  action?: 'delete';
}

export type BrowserSettingKey = 'PLAYWRIGHT_HEADLESS' | 'PLAYWRIGHT_EXECUTABLE_PATH';

export interface ApiErrorDetail {
  code?: string;
  message: string;
}

export interface ApiErrorResponse {
  error?: ApiErrorDetail;
  message?: string;
}
