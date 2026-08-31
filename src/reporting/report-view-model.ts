import type { ProjectFailureResultV3, ProjectRunManifest } from '../artifacts/artifact-manifest.js';
import type {
  CaptureMetadata,
  NavigationTarget,
  NavigationTargetKey,
  SnykFinding,
  SnykSourceEvidence,
  SonarSourceEvidence,
  VulnerabilityReportResultV3,
} from '../result-types.js';

export const REPORT_ANCHORS: Readonly<Record<NavigationTargetKey | 'artifacts', string>> = {
  'jenkins-job': '#jenkins',
  'snyk-report': '#snyk-test-report',
  'sonarqube-home': '#sonarqube-home',
  'sonarqube-overall': '#sonarqube-overall',
  'sonarqube-issues': '#sonarqube-issues',
  artifacts: '#artifacts',
};

export interface ProjectReportViewModel {
  readonly state: 'success' | 'partial' | 'failed';
  readonly project: { readonly id: string; readonly name: string };
  readonly run: { readonly runId: string; readonly observedAt: string };
  readonly jenkins?: VulnerabilityReportResultV3['jenkins'];
  readonly navigation: readonly NavigationTarget[];
  readonly snyk?: SnykSourceEvidence;
  readonly sonarqube?: SonarSourceEvidence;
  readonly warnings: readonly string[];
  readonly diagnostic?: string;
  readonly artifacts: readonly string[];
  readonly trace?: string;
}

const NAVIGATION_KEYS: readonly NavigationTargetKey[] = [
  'jenkins-job', 'snyk-report', 'sonarqube-home', 'sonarqube-overall', 'sonarqube-issues',
];
const SEVERITY_ORDER: Readonly<Record<SnykFinding['severity'], number>> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function copyCapture(value: CaptureMetadata): CaptureMetadata {
  return { ...value, ...(value.viewport === undefined ? {} : { viewport: { ...value.viewport } }) };
}

function copySnyk(value: SnykSourceEvidence): SnykSourceEvidence {
  const findings = value.findings === undefined ? undefined : [...value.findings].sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severity !== 0) return severity;
    return compareText(left.id ?? left.title ?? '', right.id ?? right.title ?? '');
  });
  return {
    ...value,
    captures: value.captures.map(copyCapture),
    navigation: [...value.navigation],
    warnings: uniqueSorted(value.warnings),
    ...(findings === undefined ? {} : { findings }),
  };
}

function copySonar(value: SonarSourceEvidence): SonarSourceEvidence {
  const facets = value.facets === undefined ? undefined : {
    types: [...value.facets.types].sort((left, right) => compareText(left.label, right.label)),
    severities: [...value.facets.severities].sort((left, right) => compareText(left.label, right.label)),
  };
  return {
    ...value,
    captures: value.captures.map(copyCapture),
    navigation: [...value.navigation],
    warnings: uniqueSorted(value.warnings),
    ...(facets === undefined ? {} : { facets }),
  };
}

function isProjectResult(
  value: VulnerabilityReportResultV3 | ProjectFailureResultV3,
): value is VulnerabilityReportResultV3 {
  return 'navigation' in value;
}

export function stateLabel(state: ProjectReportViewModel['state'] | 'found' | 'not_found' | 'incomplete'): string {
  return state === 'not_found' ? 'Not found' : state === 'incomplete' ? 'Incomplete' : state[0]!.toUpperCase() + state.slice(1);
}

export function stateClass(state: ProjectReportViewModel['state'] | 'found' | 'not_found' | 'incomplete'): string {
  return `state-${state.replace('_', '-')}`;
}

export function createProjectReportViewModel(
  result: VulnerabilityReportResultV3 | ProjectFailureResultV3,
  manifest: ProjectRunManifest,
): ProjectReportViewModel {
  const navigation = isProjectResult(result)
    ? NAVIGATION_KEYS.map((key) => ({ ...result.navigation[key], localAnchor: REPORT_ANCHORS[key] }))
    : NAVIGATION_KEYS.map((key) => ({ key, localAnchor: REPORT_ANCHORS[key], state: 'incomplete' as const }));
  const artifacts = [...manifest.artifacts.screenshots].sort(compareText);
  const diagnostic = 'diagnostic' in result ? result.diagnostic : undefined;
  return {
    state: result.state,
    project: { ...result.project },
    run: { ...result.run },
    ...(result.jenkins === undefined ? {} : { jenkins: { ...result.jenkins } }),
    navigation,
    ...(isProjectResult(result) ? { snyk: copySnyk(result.reports.snyk), sonarqube: copySonar(result.reports.sonarqube) } : {}),
    warnings: uniqueSorted([...result.warnings, ...manifest.warnings]),
    ...(diagnostic === undefined ? {} : { diagnostic }),
    artifacts,
    ...(manifest.artifacts.trace === undefined ? {} : { trace: manifest.artifacts.trace }),
  };
}
