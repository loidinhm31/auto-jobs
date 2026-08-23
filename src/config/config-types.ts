import type {
  BrowserName,
  SelectorConfig,
  SelectorOverrides,
  SourceName,
  TriggerMode,
} from '../types.js';

export interface ProjectCredentialVariablesInput {
  username: string;
  password: string;
}

export interface ProjectCredentialReferences {
  usernameVariable: string;
  passwordVariable: string;
}

export interface ProjectSourceInput {
  allowedOrigins?: readonly string[];
  reportPath?: string;
  homeUrl?: string;
}

export interface ProjectConfigInput {
  id: string;
  name: string;
  enabled?: boolean;
  baseUrl?: string;
  jenkinsUrl?: string;
  jobPath: string;
  buildNumber?: number;
  loginPath?: string;
  triggerMode?: TriggerMode;
  timeoutMs?: number;
  pollIntervalMs?: number;
  browser?: BrowserName;
  artifactDir?: string;
  credentials?: ProjectCredentialReferences;
  credentialVariables?: ProjectCredentialVariablesInput;
  selectors?: SelectorOverrides;
  allowedOrigins?: readonly string[];
  sourceOrigins?: Partial<Record<SourceName, readonly string[]>>;
  snyk?: ProjectSourceInput;
  sonarqube?: ProjectSourceInput;
}

export interface ProjectConfigDefaults {
  loginPath?: string;
  triggerMode?: TriggerMode;
  timeoutMs?: number;
  pollIntervalMs?: number;
  browser?: BrowserName;
  artifactDir?: string;
  credentials?: ProjectCredentialReferences;
  credentialVariables?: ProjectCredentialVariablesInput;
  selectors?: SelectorOverrides;
  allowedOrigins?: readonly string[];
  sourceOrigins?: Partial<Record<SourceName, readonly string[]>>;
}

export interface ProjectConfigDocumentV1 {
  schemaVersion: 1;
  projects: readonly ProjectConfigInput[];
  defaults?: ProjectConfigDefaults;
}

export interface NormalizedSourceConfig {
  readonly allowedOrigins: readonly string[];
  readonly reportPath?: string;
  readonly homeUrl?: string;
}

export interface NormalizedProjectConfig {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly jobPath: string;
  readonly jobUrl: string;
  readonly loginPath: string;
  readonly buildNumber?: number;
  readonly triggerMode: TriggerMode;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly browser: BrowserName;
  readonly artifactDir: string;
  readonly credentialVariables: ProjectCredentialReferences;
  readonly sourceOrigins: {
    readonly jenkins: string;
    readonly snyk: readonly string[];
    readonly sonarqube: readonly string[];
  };
  readonly sources: {
    readonly snyk: NormalizedSourceConfig;
    readonly sonarqube: NormalizedSourceConfig;
  };
  readonly selectors: SelectorConfig;
}

export interface ProjectSecrets {
  readonly username: string;
  readonly password: string;
}
