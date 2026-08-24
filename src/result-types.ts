import type {
  BuildReference,
  Report,
  ReportState,
} from './types.js';

export type TriggerCapability =
  | 'existing_build'
  | 'build_now'
  | 'unsupported_parameterized'
  | 'unknown';

export interface TriggerEvidence {
  capability: TriggerCapability;
  triggerAttempts: number;
  baselineBuildNumber?: number;
  queueUrl?: string;
  queueId?: string;
  build?: BuildReference;
  submittedAt?: string;
  correlatedAt?: string;
  warnings: string[];
}

export interface CaptureMetadata {
  url: string;
  title?: string;
  capturedAt: string;
  selectorStrategy?: string;
  screenshotPath?: string;
  screenshotSha256?: string;
  viewport?: { width: number; height: number };
}
export type SnykSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SnykSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SnykDetailMetadata {
  totalObserved: number;
  retainedCount: number;
  truncated: boolean;
  omittedCount: number;
}

export interface SnykScanMetadata {
  scannedPath?: string;
  packageManager?: string;
  project?: string;
  dependencyCount?: number;
  dependencyPathCount?: number;
}

export interface SnykSummary {
  counts: SnykSeverityCounts;
  detail: SnykDetailMetadata;
  metadata?: SnykScanMetadata;
}

export interface SnykFinding {
  id?: string;
  title?: string;
  severity: SnykSeverity;
  module?: string;
  description?: string;
  remediation?: string;
  paths?: string[];
  references?: string[];
}
export type NavigationTargetKey =
  | 'jenkins-build'
  | 'snyk-report'
  | 'sonarqube-home'
  | 'sonarqube-overall'
  | 'sonarqube-issues';

export interface NavigationTarget {
  key: NavigationTargetKey;
  localAnchor: string;
  state: ReportState;
  liveUrl?: string;
}

export const REQUIRED_NAVIGATION_TARGET_KEYS: readonly NavigationTargetKey[] = [
  'jenkins-build',
  'snyk-report',
  'sonarqube-home',
  'sonarqube-overall',
  'sonarqube-issues',
];

export interface NavigationTargets {
  'jenkins-build': NavigationTarget;
  'snyk-report': NavigationTarget;
  'sonarqube-home': NavigationTarget;
  'sonarqube-overall': NavigationTarget;
  'sonarqube-issues': NavigationTarget;
}

export function hasCompleteNavigationTargets(value: unknown): value is NavigationTargets {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== REQUIRED_NAVIGATION_TARGET_KEYS.length ||
    keys.some((key) => !REQUIRED_NAVIGATION_TARGET_KEYS.includes(key as NavigationTargetKey))
  ) {
    return false;
  }
  return REQUIRED_NAVIGATION_TARGET_KEYS.every((key) => {
    const target = record[key];
    if (typeof target !== 'object' || target === null || Array.isArray(target)) {
      return false;
    }
    const candidate = target as Record<string, unknown>;
    return (
      candidate.key === key &&
      typeof candidate.localAnchor === 'string' &&
      candidate.localAnchor.length > 0 &&
      (candidate.state === 'found' || candidate.state === 'not_found' || candidate.state === 'incomplete')
    );
  });
}
export interface SourceEvidence {
  state: ReportState;
  captures: CaptureMetadata[];
  navigation: NavigationTarget[];
  warnings: string[];
}

export interface SnykSourceEvidence extends SourceEvidence {
  summary?: SnykSummary;
  findings?: SnykFinding[];
}

export interface VulnerabilityReportResult {
  schemaVersion: 1;
  jenkins: {
    baseUrl: string;
    jobPath: string;
    jobUrl: string;
    buildNumber: number;
    buildUrl: string;
    status: string;
  };
  reports: { sonarqube: Report; snyk: Report };
  triggered: boolean;
  observedAt: string;
}

export interface VulnerabilityReportResultV2 {
  schemaVersion: 2;
  state: 'success' | 'partial';
  project: { id: string; name: string };
  run: { runId: string; observedAt: string };
  jenkins: {
    baseUrl: string;
    jobPath: string;
    jobUrl: string;
    buildNumber: number;
    buildUrl: string;
    status: string;
    trigger: TriggerEvidence;
  };
  navigation: NavigationTargets;
  reports: { sonarqube: SourceEvidence; snyk: SnykSourceEvidence };
  warnings: string[];
}

export interface AggregateProjectSummary {
  projectId: string;
  name: string;
  state: 'success' | 'partial' | 'failed';
  buildNumber?: number;
  runId?: string;
  reportPath?: string;
  runs: AggregateRunSummary[];
  warnings: string[];
}

export interface AggregateRunSummary {
  buildNumber: number;
  runId: string;
  state: 'success' | 'partial' | 'failed';
  manifestPath: string;
  warnings: string[];
}

export interface AggregateReportResult {
  schemaVersion: 2;
  generatedAt: string;
  projects: AggregateProjectSummary[];
}
