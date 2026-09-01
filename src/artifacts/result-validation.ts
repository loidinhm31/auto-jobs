import type {
  AggregateProjectSummary,
  AggregateReportResult,
  AggregateRunSummary,
  CaptureMetadata,
  NavigationTarget,
  SourceEvidence,
  SonarIssueFacets,
  VulnerabilityReportResultV3,
} from '../result-types.js';
import type { ProjectFailureResultV3, ProjectRunManifest } from './artifact-manifest.js';
import { redactText } from '../config-errors.js';
import { isRecord } from '../config-selectors.js';
import { SAFE_ID } from './artifact-identity.js';
import { isSafeReferenceUrl } from '../security/url-policy.js';
export const MAX_PERSISTED_WARNING_ITEMS = 32;
export const MAX_PERSISTED_WARNING_LENGTH = 500;
export const MAX_PERSISTED_DIAGNOSTIC_LENGTH = 2_000;
export const MAX_CAPTURE_ITEMS = 128;
export const MAX_SOURCE_NAVIGATION_ITEMS = 32;
export const MAX_CAPTURE_URL_LENGTH = 2_048;
export const MAX_CAPTURE_TITLE_LENGTH = 512;
export const MAX_SELECTOR_STRATEGY_LENGTH = 256;
export const MAX_ARTIFACT_REFERENCE_LENGTH = 128;
export const MAX_RUN_ARTIFACT_COUNT = 16;
export const MAX_RUN_OPTIONAL_ARTIFACT_COUNT = MAX_RUN_ARTIFACT_COUNT - 1;
export const MAX_RUN_ARTIFACT_DIRECTORY_ENTRIES = 64;
export const MAX_RUN_ARTIFACT_BYTES = 50 * 1_048_576;
export const MAX_RUN_ARTIFACT_DIRECTORY_BYTES = MAX_RUN_ARTIFACT_BYTES;
export const MAX_SINGLE_ARTIFACT_BYTES = 25 * 1_048_576;
export const MAX_SNYK_FINDINGS = 500;
export const MAX_SNYK_PATHS = 64;
export const MAX_SNYK_REFERENCES = 64;
export const MAX_SNYK_TEXT_LENGTH = 8_192;

const SAFE_ARTIFACT = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const RESERVED_ARTIFACT_NAMES = new Set(['data.json', 'manifest.json', 'index.html', 'trace.zip']);
const NAVIGATION_KEYS = ['jenkins-job', 'snyk-report', 'sonarqube-home', 'sonarqube-overall', 'sonarqube-issues'] as const;
const SNYK_NAVIGATION_KEYS = ['snyk-report'] as const;
const SONAR_NAVIGATION_KEYS = ['sonarqube-home', 'sonarqube-overall', 'sonarqube-issues'] as const;
const JENKINS_KEYS = ['jobUrl'] as const;
const NAVIGATION_TARGET_OBJECT_KEYS = ['key', 'localAnchor', 'state', 'liveUrl'] as const;
const CAPTURE_KEYS = ['url', 'title', 'capturedAt', 'selectorStrategy', 'screenshotPath', 'screenshotSha256', 'viewport'] as const;
const VIEWPORT_KEYS = ['width', 'height'] as const;
const SOURCE_KEYS = ['state', 'captures', 'navigation', 'warnings'] as const;
const SONAR_SOURCE_KEYS = [...SOURCE_KEYS, 'facets'] as const;
const SNYK_SOURCE_KEYS = [...SOURCE_KEYS, 'summary', 'findings'] as const;
const PROJECT_KEYS = ['id', 'name'] as const;
const RUN_KEYS = ['runId', 'observedAt'] as const;
const DIAGNOSTICS_KEYS = ['lastSafeUrl', 'observationErrors'] as const;
const FACETS_KEYS = ['types', 'severities'] as const;
const FACET_VALUE_KEYS = ['label', 'count'] as const;
const SUMMARY_KEYS = ['counts', 'detail', 'metadata'] as const;
const SUMMARY_COUNTS_KEYS = ['critical', 'high', 'medium', 'low'] as const;
const SUMMARY_DETAIL_KEYS = ['totalObserved', 'retainedCount', 'truncated', 'omittedCount'] as const;
const SUMMARY_METADATA_KEYS = ['scannedPath', 'packageManager', 'project', 'dependencyCount', 'dependencyPathCount'] as const;
const FINDING_KEYS = ['id', 'title', 'severity', 'module', 'description', 'remediation', 'paths', 'references'] as const;
const PROJECT_RESULT_KEYS = ['schemaVersion', 'state', 'project', 'run', 'jenkins', 'navigation', 'reports', 'warnings'] as const;
const REPORTS_KEYS = ['snyk', 'sonarqube'] as const;
const AGGREGATE_KEYS = ['schemaVersion', 'generatedAt', 'projects', 'warnings'] as const;
const AGGREGATE_PROJECT_KEYS = ['projectId', 'name', 'state', 'runId', 'reportPath', 'runs', 'warnings'] as const;
const AGGREGATE_RUN_KEYS = ['runId', 'state', 'jobId', 'branch', 'manifestPath', 'reportPath', 'warnings'] as const;
const MAX_AGGREGATE_PROJECTS = 50;
const MAX_AGGREGATE_RUNS_PER_PROJECT = 5_000;
const MAX_AGGREGATE_TOTAL_RUNS = 5_000;
const MAX_AGGREGATE_PATH_LENGTH = 512;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MANIFEST_KEYS = ['kind', 'schemaVersion', 'project', 'run', 'state', 'jenkins', 'artifacts', 'warnings', 'diagnostic', 'diagnostics'] as const;
const MANIFEST_PROJECT_KEYS = ['id', 'name'] as const;
const MANIFEST_RUN_KEYS = ['runId', 'observedAt'] as const;
const MANIFEST_JENKINS_KEYS = ['jobUrl'] as const;
const MANIFEST_ARTIFACT_KEYS = ['manifest', 'data', 'screenshots', 'trace'] as const;
const MANIFEST_DIAGNOSTICS_KEYS = ['lastSafeUrl', 'observationErrors'] as const;

const FAILURE_RESULT_KEYS = ['schemaVersion', 'project', 'run', 'state', 'jenkins', 'diagnostic', 'warnings', 'diagnostics'] as const;


export function hasOnlyKeys(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function boundedSafeId(value: unknown, maximum: number): value is string {
  return boundedString(value, maximum) && SAFE_ID.test(value);
}

function optionalString(value: unknown, maximum: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maximum);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

export function isSafeArtifactReference(value: string): boolean {
  return value.length <= MAX_ARTIFACT_REFERENCE_LENGTH && SAFE_ARTIFACT.test(value);
}

export function isSafeScreenshotReference(value: string): boolean {
  return isSafeArtifactReference(value) && !RESERVED_ARTIFACT_NAMES.has(value);
}

export function isSafePersistedUrl(value: unknown): value is string {
  if (!boundedString(value, MAX_CAPTURE_URL_LENGTH)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash && isSafeReferenceUrl(value);
  } catch {
    return false;
  }
}

function isSafeReference(value: unknown): value is string {
  return boundedString(value, MAX_CAPTURE_URL_LENGTH) && isSafeReferenceUrl(value);
}

function validWarnings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_PERSISTED_WARNING_ITEMS &&
    value.every((item) => boundedString(item, MAX_PERSISTED_WARNING_LENGTH));
}
export function sanitizePersistedWarnings(values: readonly string[]): string[] {
  return values
    .slice(-MAX_PERSISTED_WARNING_ITEMS)
    .map((value) => redactText(value).slice(0, MAX_PERSISTED_WARNING_LENGTH))
    .filter((value) => value.length > 0);
}

function isIsoUtcTimestamp(value: unknown): value is string {
  if (!boundedString(value, 128) || !ISO_UTC_TIMESTAMP.test(value)) return false;
  return new Date(value).toISOString() === value;
}

export interface ManifestContractOptions {
  readonly expectedProjectId?: string;
  readonly expectedRunId?: string;
  readonly allowUnsafeArtifactReferences?: boolean;
}

export function isValidManifestContract(
  value: unknown,
  options: ManifestContractOptions = {},
): value is ProjectRunManifest {
  if (!hasOnlyKeys(value, MANIFEST_KEYS) || value.kind !== 'project-run' || value.schemaVersion !== 3 ||
    !hasOnlyKeys(value.project, MANIFEST_PROJECT_KEYS) || !boundedSafeId(value.project.id, 80) ||
    !boundedString(value.project.name, 256) || options.expectedProjectId !== undefined && value.project.id !== options.expectedProjectId ||
    !hasOnlyKeys(value.run, MANIFEST_RUN_KEYS) || !boundedSafeId(value.run.runId, 96) ||
    !boundedString(value.run.observedAt, 128) || options.expectedRunId !== undefined && value.run.runId !== options.expectedRunId ||
    !['success', 'partial', 'failed'].includes(String(value.state)) ||
    !hasOnlyKeys(value.artifacts, MANIFEST_ARTIFACT_KEYS) || value.artifacts.manifest !== 'manifest.json' ||
    value.artifacts.data !== 'data.json' || !Array.isArray(value.artifacts.screenshots) ||
    value.artifacts.screenshots.length > MAX_RUN_OPTIONAL_ARTIFACT_COUNT ||
    value.artifacts.trace !== undefined && value.artifacts.screenshots.length + 1 > MAX_RUN_OPTIONAL_ARTIFACT_COUNT ||
    !validWarnings(value.warnings) ||
    value.diagnostic !== undefined && (typeof value.diagnostic !== 'string' || value.diagnostic.length > MAX_PERSISTED_DIAGNOSTIC_LENGTH)) {
    return false;
  }
  if (value.jenkins !== undefined && (!hasOnlyKeys(value.jenkins, MANIFEST_JENKINS_KEYS) || !isSafeJenkinsJobUrl(value.jenkins.jobUrl))) return false;
  if (!options.allowUnsafeArtifactReferences &&
    (value.artifacts.trace !== undefined && value.artifacts.trace !== 'trace.zip' ||
      !value.artifacts.screenshots.every((item) => typeof item === 'string' && isSafeScreenshotReference(item)) ||
      new Set(value.artifacts.screenshots).size !== value.artifacts.screenshots.length)) return false;
  if (value.diagnostics === undefined) return true;
  return hasOnlyKeys(value.diagnostics, MANIFEST_DIAGNOSTICS_KEYS) &&
    Array.isArray(value.diagnostics.observationErrors) &&
    validWarnings(value.diagnostics.observationErrors) &&
    (value.diagnostics.lastSafeUrl === undefined || isSafePersistedUrl(value.diagnostics.lastSafeUrl));
}


export function isSafeJenkinsJobUrl(value: unknown): value is string {
  if (!isSafePersistedUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

function validJenkinsResult(value: unknown): boolean {
  return hasOnlyKeys(value, JENKINS_KEYS) && isSafeJenkinsJobUrl(value.jobUrl);
}
function validNavigationTarget(value: unknown, expectedKey: string): value is NavigationTarget {
  if (!hasOnlyKeys(value, NAVIGATION_TARGET_OBJECT_KEYS) || value.key !== expectedKey || !boundedString(value.localAnchor, 256) ||
    !['found', 'not_found', 'incomplete'].includes(String(value.state))) return false;
  return value.liveUrl === undefined || isSafePersistedUrl(value.liveUrl);
}

function validNavigation(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length !== NAVIGATION_KEYS.length) return false;
  return NAVIGATION_KEYS.every((key) => validNavigationTarget(value[key], key));
}

function validCapture(value: unknown): value is CaptureMetadata {
  if (!hasOnlyKeys(value, CAPTURE_KEYS) || !isSafePersistedUrl(value.url) || !boundedString(value.capturedAt, 128) ||
    !optionalString(value.title, MAX_CAPTURE_TITLE_LENGTH) || !optionalString(value.selectorStrategy, MAX_SELECTOR_STRATEGY_LENGTH) ||
    (value.screenshotSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(String(value.screenshotSha256))) ||
    (value.screenshotPath !== undefined && (typeof value.screenshotPath !== 'string' || !isSafeScreenshotReference(value.screenshotPath)))) return false;
  if (value.viewport === undefined) return true;
  const viewport = value.viewport;
  return hasOnlyKeys(viewport, VIEWPORT_KEYS) && positiveInteger(viewport.width) && viewport.width <= 10_000 &&
    positiveInteger(viewport.height) && viewport.height <= 10_000;
}

function validSource(value: unknown, allowedKeys: readonly string[] = SOURCE_KEYS): value is SourceEvidence {
  if (!hasOnlyKeys(value, allowedKeys) || !['found', 'not_found', 'incomplete'].includes(String(value.state)) ||
    !Array.isArray(value.captures) || value.captures.length > MAX_CAPTURE_ITEMS || !value.captures.every(validCapture) ||
    !Array.isArray(value.navigation) || value.navigation.length > MAX_SOURCE_NAVIGATION_ITEMS ||
    !value.navigation.every((item) => isRecord(item) && typeof item.key === 'string' && NAVIGATION_KEYS.includes(item.key as typeof NAVIGATION_KEYS[number]) && validNavigationTarget(item, item.key)) ||
    !validWarnings(value.warnings)) return false;
  return true;
}

function validSonarFacets(value: unknown): value is SonarIssueFacets {
  if (!hasOnlyKeys(value, FACETS_KEYS) || !Array.isArray(value.types) || !Array.isArray(value.severities)) return false;
  const validGroup = (group: unknown): boolean => Array.isArray(group) && group.length <= 64 && group.every((item) =>
    hasOnlyKeys(item, FACET_VALUE_KEYS) && boundedString(item.label, 128) && typeof item.count === 'number' &&
    Number.isSafeInteger(item.count) && item.count >= 0 && item.count <= 10_000_000);
  return validGroup(value.types) && validGroup(value.severities);
}

function validSonar(value: unknown): boolean {
  if (!validSource(value, SONAR_SOURCE_KEYS) || !isRecord(value)) return false;
  return value.facets === undefined || validSonarFacets(value.facets);
}

function validSnykSummary(value: unknown): boolean {
  if (!hasOnlyKeys(value, SUMMARY_KEYS) || !hasOnlyKeys(value.counts, SUMMARY_COUNTS_KEYS) || !hasOnlyKeys(value.detail, SUMMARY_DETAIL_KEYS)) return false;
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    const count = value.counts[severity];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 10_000_000) return false;
  }
  const detail = value.detail;
  if (typeof detail.totalObserved !== 'number' || !Number.isSafeInteger(detail.totalObserved) || detail.totalObserved < 0 ||
    typeof detail.retainedCount !== 'number' || !Number.isSafeInteger(detail.retainedCount) || detail.retainedCount < 0 || detail.retainedCount > MAX_SNYK_FINDINGS ||
    typeof detail.omittedCount !== 'number' || !Number.isSafeInteger(detail.omittedCount) || detail.omittedCount < 0 ||
    typeof detail.truncated !== 'boolean' || detail.retainedCount + detail.omittedCount !== detail.totalObserved ||
    detail.truncated !== (detail.omittedCount > 0)) return false;
  if (value.metadata === undefined) return true;
  if (!hasOnlyKeys(value.metadata, SUMMARY_METADATA_KEYS)) return false;
  return optionalString(value.metadata.scannedPath, MAX_SNYK_TEXT_LENGTH) &&
    optionalString(value.metadata.packageManager, MAX_CAPTURE_TITLE_LENGTH) &&
    (value.metadata.dependencyCount === undefined || positiveInteger(value.metadata.dependencyCount) || value.metadata.dependencyCount === 0) &&
    (value.metadata.dependencyPathCount === undefined || positiveInteger(value.metadata.dependencyPathCount) || value.metadata.dependencyPathCount === 0);
}


function validSnykFinding(value: unknown): boolean {
  if (!hasOnlyKeys(value, FINDING_KEYS) || !['critical', 'high', 'medium', 'low'].includes(String(value.severity))) return false;
  if (!optionalString(value.id, 256) || !optionalString(value.title, MAX_CAPTURE_TITLE_LENGTH) ||
    !optionalString(value.module, MAX_CAPTURE_TITLE_LENGTH) || !optionalString(value.description, MAX_SNYK_TEXT_LENGTH) ||
    !optionalString(value.remediation, MAX_SNYK_TEXT_LENGTH)) return false;
  if (value.paths !== undefined && (!Array.isArray(value.paths) || value.paths.length > MAX_SNYK_PATHS || !value.paths.every((item) => boundedString(item, MAX_SNYK_TEXT_LENGTH)))) return false;
  if (value.references !== undefined && (!Array.isArray(value.references) || value.references.length > MAX_SNYK_REFERENCES || !value.references.every(isSafeReference))) return false;
  return true;
}

function validSnyk(value: unknown): boolean {
  if (!validSource(value, SNYK_SOURCE_KEYS) || !isRecord(value)) return false;
  if (value.summary !== undefined && !validSnykSummary(value.summary)) return false;
  return value.findings === undefined || (Array.isArray(value.findings) && value.findings.length <= MAX_SNYK_FINDINGS && value.findings.every(validSnykFinding));
}

function validProject(value: unknown): value is { id: string; name: string } {
  return hasOnlyKeys(value, PROJECT_KEYS) && boundedString(value.id, 80) && boundedString(value.name, 256);
}

function validRun(value: unknown): value is { runId: string; observedAt: string } {
  return hasOnlyKeys(value, RUN_KEYS) && boundedString(value.runId, 96) && boundedString(value.observedAt, 128);
}

function validDiagnostics(value: unknown): boolean {
  if (!hasOnlyKeys(value, DIAGNOSTICS_KEYS) || !Array.isArray(value.observationErrors) || !validWarnings(value.observationErrors) ||
    !optionalString(value.lastSafeUrl, MAX_CAPTURE_URL_LENGTH)) return false;
  return value.lastSafeUrl === undefined || isSafePersistedUrl(value.lastSafeUrl);
}

function validCommon(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return hasOnlyKeys(value, allowedKeys) && value.schemaVersion === 3 && validProject(value.project) && validRun(value.run) && validWarnings(value.warnings) &&
    (value.diagnostic === undefined || boundedString(value.diagnostic, MAX_PERSISTED_DIAGNOSTIC_LENGTH)) &&
    (value.diagnostics === undefined || validDiagnostics(value.diagnostics));
}

function validSuccessfulSource(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!isRecord(value) || value.state !== 'found' || !Array.isArray(value.warnings) || value.warnings.length !== 0 ||
    !Array.isArray(value.navigation) || value.navigation.length !== expectedKeys.length) return false;
  const seen = new Set<string>();
  return value.navigation.every((item) => {
    if (!isRecord(item) || item.state !== 'found' || typeof item.key !== 'string' ||
      !expectedKeys.includes(item.key) || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  }) && seen.size === expectedKeys.length;
}

function validSuccessfulResult(value: Record<string, unknown>): boolean {
  if (value.state !== 'success') return true;
  const navigation = value.navigation;
  const reports = value.reports;
  if (!Array.isArray(value.warnings) || value.warnings.length !== 0 ||
    !isRecord(navigation) || !isRecord(reports)) return false;
  return NAVIGATION_KEYS.every((key) => {
    const target = navigation[key];
    return isRecord(target) && target.state === 'found';
  }) && validSuccessfulSource(reports.snyk, SNYK_NAVIGATION_KEYS) &&
    validSuccessfulSource(reports.sonarqube, SONAR_NAVIGATION_KEYS);
}

export function isValidProjectResult(value: unknown): value is VulnerabilityReportResultV3 {
  if (!isRecord(value) || !validCommon(value, PROJECT_RESULT_KEYS) || !['success', 'partial'].includes(String(value.state)) ||
    !validJenkinsResult(value.jenkins) || !validNavigation(value.navigation) || !hasOnlyKeys(value.reports, REPORTS_KEYS) ||
    !validSnyk(value.reports.snyk) || !validSonar(value.reports.sonarqube)) return false;

  return validSuccessfulResult(value);
}

function validFailureJenkins(value: unknown): boolean {
  return hasOnlyKeys(value, JENKINS_KEYS) && isSafeJenkinsJobUrl(value.jobUrl);
}

export function isValidFailureResult(value: unknown): value is ProjectFailureResultV3 {
  if (!isRecord(value) || !validCommon(value, FAILURE_RESULT_KEYS) || value.state !== 'failed' || !boundedString(value.diagnostic, MAX_PERSISTED_DIAGNOSTIC_LENGTH)) return false;
  return value.jenkins === undefined || validFailureJenkins(value.jenkins);
}

export function assertValidProjectResult(value: unknown): asserts value is VulnerabilityReportResultV3 {
  if (!isValidProjectResult(value)) throw new Error('project result schema is invalid');
}

export function assertValidFailureResult(value: unknown): asserts value is ProjectFailureResultV3 {
  if (!isValidFailureResult(value)) throw new Error('project failure result schema is invalid');
}

function aggregateArtifactPath(
  projectId: string,
  runId: string,
  filename: 'manifest.json' | 'index.html',
): string {
  return `${projectId}/${runId}/${filename}`;
}

function validAggregateState(value: unknown): boolean {
  return value === 'success' || value === 'partial' || value === 'failed';
}

function validAggregateRun(value: unknown, projectId: string): value is AggregateRunSummary {
  if (!hasOnlyKeys(value, AGGREGATE_RUN_KEYS)) return false;
  const runId = value.runId;
  const state = value.state;
  const jobId = value.jobId;
  const branch = value.branch;
  const manifestPath = value.manifestPath;
  const reportPath = value.reportPath;
  if (!boundedString(runId, 96) || !SAFE_ID.test(runId) || !validAggregateState(state) ||
    (jobId !== undefined && !boundedString(jobId, 256)) ||
    (branch !== undefined && !boundedString(branch, 256)) ||
    manifestPath !== aggregateArtifactPath(projectId, runId, 'manifest.json') ||
    (reportPath !== undefined && reportPath !== aggregateArtifactPath(projectId, runId, 'index.html')) ||
    !validWarnings(value.warnings)) return false;
  return manifestPath.length <= MAX_AGGREGATE_PATH_LENGTH &&
    (reportPath === undefined || reportPath.length <= MAX_AGGREGATE_PATH_LENGTH);
}

function validAggregateProject(value: unknown): value is AggregateProjectSummary {
  if (!hasOnlyKeys(value, AGGREGATE_PROJECT_KEYS)) return false;
  const projectId = value.projectId;
  const name = value.name;
  const state = value.state;
  const runId = value.runId;
  const reportPath = value.reportPath;
  const runs = value.runs;
  if (!boundedString(projectId, 80) || !SAFE_ID.test(projectId) || !boundedString(name, 256) ||
    !validAggregateState(state) || !Array.isArray(runs) || runs.length > MAX_AGGREGATE_RUNS_PER_PROJECT ||
    !validWarnings(value.warnings) || (runId !== undefined && (!boundedString(runId, 96) || !SAFE_ID.test(runId))) ||
    (reportPath !== undefined && (runId === undefined || reportPath !== aggregateArtifactPath(projectId, runId, 'index.html') ||
      reportPath.length > MAX_AGGREGATE_PATH_LENGTH))) return false;
  const runIds = new Set<string>();
  for (const run of runs) {
    if (!validAggregateRun(run, projectId) || runIds.has(run.runId)) return false;
    runIds.add(run.runId);
  }
  return reportPath === undefined || runs.some((run) => run.runId === runId && run.reportPath === reportPath);
}

export function isValidAggregateResult(value: unknown): value is AggregateReportResult {
  if (!hasOnlyKeys(value, AGGREGATE_KEYS) || value.schemaVersion !== 3) return false;
  const generatedAt = value.generatedAt;
  const projects = value.projects;
  if (!isIsoUtcTimestamp(generatedAt) || !Array.isArray(projects) || projects.length === 0 ||
    projects.length > MAX_AGGREGATE_PROJECTS || !validWarnings(value.warnings)) return false;
  const projectIds = new Set<string>();
  let totalRuns = 0;
  for (const project of projects) {
    if (!validAggregateProject(project) || projectIds.has(project.projectId)) return false;
    totalRuns += project.runs.length;
    if (totalRuns > MAX_AGGREGATE_TOTAL_RUNS) return false;
    projectIds.add(project.projectId);
  }
  return true;
}

export function assertValidAggregateResult(value: unknown): asserts value is AggregateReportResult {
  if (!isValidAggregateResult(value)) throw new Error('aggregate result schema is invalid');
}
