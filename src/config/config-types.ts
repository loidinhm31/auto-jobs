import type {
  BrowserName,
  SelectorConfig,
  SelectorOverrides,
  SourceName,
} from '../types.js';

export interface ProjectCredentialReferences {
  usernameVariable: string;
  passwordVariable: string;
}

export interface ProjectSourceInput {
  allowedOrigins?: readonly string[];
  projectId?: string;
}

export type ProjectOriginSourceName = 'jenkins' | SourceName;

export type ProjectOriginPolicies = Partial<
  Record<ProjectOriginSourceName, readonly string[]>
>;

export interface ProjectConfigInput {
  id: string;
  name: string;
  loginUrl: string;
  jobUrl: string;
  enabled?: boolean;
  timeoutMs?: number;
  browser?: BrowserName;
  artifactDir?: string;
  credentials?: ProjectCredentialReferences;
  selectors?: SelectorOverrides;
  allowedOrigins?: readonly string[];
  sourceOrigins?: ProjectOriginPolicies;
  snyk?: ProjectSourceInput;
  sonarqube?: ProjectSourceInput;
}

export interface ProjectConfigDefaults {
  timeoutMs?: number;
  browser?: BrowserName;
  artifactDir?: string;
  credentials?: ProjectCredentialReferences;
  selectors?: SelectorOverrides;
  allowedOrigins?: readonly string[];
  sourceOrigins?: ProjectOriginPolicies;
}

export interface ProjectConfigDocumentV1 {
  schemaVersion: 1;
  projects: readonly ProjectConfigInput[];
  defaults?: ProjectConfigDefaults;
}

export interface NormalizedSourceConfig {
  readonly allowedOrigins: readonly string[];
  readonly projectId?: string;
}

export interface NormalizedProjectConfig {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly loginUrl: string;
  readonly jobUrl: string;
  readonly timeoutMs: number;
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
