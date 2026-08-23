export type ReportState = 'found' | 'not_found' | 'incomplete';
export type SourceName = 'snyk' | 'sonarqube';
export type SelectorKind = 'role' | 'label' | 'testId' | 'text' | 'css';
export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export type TriggerMode = 'ui';

export interface LocatorSelector {
  kind: SelectorKind;
  value: string;
  name?: string;
  required: boolean;
}

export interface SelectorConfig {
  trigger: LocatorSelector;
  authLandmark: LocatorSelector;
  queueUrl: LocatorSelector;
  buildStatus: LocatorSelector;
  buildUrl: LocatorSelector;
  sonarqubeReport: LocatorSelector;
  snykReport: LocatorSelector;
}

export type LocatorSelectorInput = Omit<LocatorSelector, 'required'> & {
  required?: boolean;
};

export type SelectorOverrides = Partial<
  Record<keyof SelectorConfig, LocatorSelectorInput>
>;

export interface Report {
  state: ReportState;
  urls: string[];
  text: string[];
}

export interface BuildReference {
  number: number;
  url: string;
  queueUrl?: string;
}

export type BuildTriggerCapability = 'build_now' | 'unsupported_parameterized';

export type ProjectTriggerState =
  | 'capability_unchecked'
  | 'unsupported_parameterized'
  | 'build_now_ready'
  | 'baseline_captured'
  | 'submitted'
  | 'queue_correlated'
  | 'build_correlated';

export interface QueueReference {
  id: number;
  url: string;
}

export interface JenkinsBaseline {
  capturedAt: string;
  latestBuildNumber?: number;
  queueItems: readonly QueueReference[];
}

export interface TriggerDiagnostics {
  lastSafeUrl?: string;
  observationErrors: readonly string[];
  reloadCount: number;
}

export interface BuildTriggerResult {
  triggered: boolean;
  capability: BuildTriggerCapability;
  triggerAttempts: number;
  state: ProjectTriggerState;
  baseline?: JenkinsBaseline;
  queueUrl?: string;
  build?: BuildReference;
  diagnostics: TriggerDiagnostics;
}

export interface BuildTrigger {
  trigger(): Promise<BuildTriggerResult>;
}

export type {
  NormalizedProjectConfig,
  NormalizedSourceConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectCredentialReferences,
  ProjectCredentialVariablesInput,
  ProjectSecrets,
  ProjectSourceInput,
} from './config/config-types.js';
export type {
  AggregateProjectSummary,
  AggregateReportResult,
  CaptureMetadata,
  NavigationTarget,
  NavigationTargetKey,
  SourceEvidence,
  TriggerCapability,
  TriggerEvidence,
  VulnerabilityReportResult,
  VulnerabilityReportResultV2,
} from './result-types.js';
export {
  hasCompleteNavigationTargets,
  REQUIRED_NAVIGATION_TARGET_KEYS,
} from './result-types.js';
