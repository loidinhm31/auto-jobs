export type ReportState = 'found' | 'not_found' | 'incomplete';
export type SourceName = 'snyk' | 'sonarqube';
export type SelectorKind = 'role' | 'label' | 'testId' | 'text' | 'css';
export type BrowserName = 'chromium' | 'firefox' | 'webkit';

export interface LocatorSelector {
  kind: SelectorKind;
  value: string;
  name?: string;
  required: boolean;
}

export interface SelectorConfig {
  authLandmark: LocatorSelector;
  sonarqubeReport: LocatorSelector;
  snykReport: LocatorSelector;
}

export type LocatorSelectorInput = Omit<LocatorSelector, 'required'> & {
  required?: boolean;
};

export type SelectorOverrides = Partial<
  Record<keyof SelectorConfig, LocatorSelectorInput>
>;

export type {
  NormalizedProjectConfig,
  NormalizedSourceConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectCredentialReferences,
  ProjectOriginPolicies,
  ProjectSecrets,
  ProjectSourceInput,
} from './config/config-types.js';

export type {
  AggregateProjectSummary,
  AggregateReportResult,
  AggregateRunSummary,
  CaptureMetadata,
  NavigationTarget,
  NavigationTargetKey,
  SourceEvidence,
  SnykDetailMetadata,
  SnykFinding,
  SnykScanMetadata,
  SnykSeverity,
  SnykSeverityCounts,
  SnykSourceEvidence,
  SnykSummary,
  SonarFacetValue,
  SonarIssueFacets,
  SonarSourceEvidence,
  VulnerabilityReportResultV3,
} from './result-types.js';
export {
  hasCompleteNavigationTargets,
  REQUIRED_NAVIGATION_TARGET_KEYS,
} from './result-types.js';

export type {
  ProjectOutcome,
  ProjectOutcomeState,
  ProjectRunIdentity,
  RunnerExecutionResult,
} from './project/project-types.js';
