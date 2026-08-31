import type { ReportState } from './types.js';

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
  | 'jenkins-job'
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
  'jenkins-job',
  'snyk-report',
  'sonarqube-home',
  'sonarqube-overall',
  'sonarqube-issues',
];

export interface NavigationTargets {
  'jenkins-job': NavigationTarget;
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
      (candidate.state === 'found' ||
        candidate.state === 'not_found' ||
        candidate.state === 'incomplete')
    );
  });
}

export interface SourceEvidence {
  state: ReportState;
  captures: CaptureMetadata[];
  navigation: NavigationTarget[];
  warnings: string[];
}

export interface SonarFacetValue {
  label: string;
  count: number;
}

export interface SonarIssueFacets {
  types: SonarFacetValue[];
  severities: SonarFacetValue[];
}

export interface SonarSourceEvidence extends SourceEvidence {
  facets?: SonarIssueFacets;
}

export interface SnykSourceEvidence extends SourceEvidence {
  summary?: SnykSummary;
  findings?: SnykFinding[];
}

export interface VulnerabilityReportResultV3 {
  schemaVersion: 3;
  state: 'success' | 'partial';
  project: { id: string; name: string };
  run: { runId: string; observedAt: string };
  jenkins: {
    jobUrl: string;
  };
  navigation: NavigationTargets;
  reports: { sonarqube: SonarSourceEvidence; snyk: SnykSourceEvidence };
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

export interface AggregateRunSummary {
  runId: string;
  state: 'success' | 'partial' | 'failed';
  manifestPath: string;
  reportPath?: string;
  warnings: string[];
}

export interface AggregateReportResult {
  schemaVersion: 3;
  generatedAt: string;
  projects: AggregateProjectSummary[];
  warnings: string[];
}
