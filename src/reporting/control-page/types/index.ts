import type {
  BrowserName,
  RunType,
  SelectorConfig,
  SelectorOverrides,
  SourceName,
} from '../../../types.js';

export type { BrowserName, RunType, SelectorConfig, SelectorOverrides, SourceName };

export interface ProjectCredentialReferences {
  usernameVariable: string;
  passwordVariable: string;
}

export interface ProjectConfigInput {
  id: string;
  name: string;
  loginUrl: string;
  jobUrl: string;
  runType?: RunType;
  waitForCompletion?: boolean;
  waitTimeoutMs?: number;
  enabled?: boolean;
  timeoutMs?: number;
  browser?: BrowserName;
  artifactDir?: string;
  credentials?: ProjectCredentialReferences;
  credentialVariables?: ProjectCredentialReferences | readonly string[] | string[];
  selectors?: SelectorOverrides;
  allowedOrigins?: readonly string[];
  [key: string]: unknown;
}

export interface ProjectConfigDefaults {
  timeoutMs?: number;
  browser?: BrowserName;
  artifactDir?: string;
  credentials?: ProjectCredentialReferences;
  credentialVariables?: ProjectCredentialReferences | readonly string[] | string[];
  selectors?: SelectorOverrides;
  allowedOrigins?: readonly string[];
  [key: string]: unknown;
}

export interface ProjectConfigDocumentV1 {
  schemaVersion: 1;
  projects: ProjectConfigInput[];
  defaults?: ProjectConfigDefaults;
  [key: string]: unknown;
}

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

export interface RunResult {
  reportUrl?: string;
  buildState?: string;
  buildNumber?: string;
  buildResult?: string;
  stages?: readonly RunStageResult[];
  jobUrl?: string;
  buildPageUrl?: string;
  error?: string;
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
