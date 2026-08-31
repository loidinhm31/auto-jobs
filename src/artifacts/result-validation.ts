import type {
  CaptureMetadata,
  NavigationTarget,
  SourceEvidence,
  SonarIssueFacets,
  TriggerEvidence,
  VulnerabilityReportResultV2,
} from '../result-types.js';
import type { ProjectFailureResultV2 } from './artifact-manifest.js';
import { isSafeReferenceUrl } from '../security/url-policy.js';
import { resolveSafeRelativeUrl } from '../security/relative-url-policy.js';

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
const NAVIGATION_KEYS = ['jenkins-build', 'snyk-report', 'sonarqube-home', 'sonarqube-overall', 'sonarqube-issues'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
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

function validBuild(value: unknown, baseUrl: string): boolean {
  if (!isRecord(value) || !positiveInteger(value.number) || !isSafePersistedUrl(value.url)) return false;
  return value.queueUrl === undefined || (isSafePersistedUrl(value.queueUrl) && sameJenkinsContextUrl(value.queueUrl, baseUrl));
}

function sameJenkinsContextUrl(candidateUrl: string, baseUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/\/+$/u, '');
    const contextPath = basePath === '' ? '/' : `${basePath}/`;
    return candidate.origin === base.origin && !base.username && !base.password && !base.search && !base.hash &&
      !candidate.username && !candidate.password && !candidate.search && !candidate.hash &&
      (basePath === '' || candidate.pathname === basePath || candidate.pathname.startsWith(contextPath));
  } catch {
    return false;
  }
}

function sameJenkinsJobIdentity(actualUrl: string, expectedUrl: string): boolean {
  try {
    const actual = new URL(actualUrl);
    const expected = new URL(expectedUrl);
    return actual.origin === expected.origin && !actual.username && !actual.password &&
      !expected.username && !expected.password && !actual.search && !actual.hash &&
      !expected.search && !expected.hash &&
      actual.pathname.replace(/\/+$/u, '') === expected.pathname.replace(/\/+$/u, '');
  } catch {
    return false;
  }
}

function expectedJenkinsJobUrl(baseUrl: string, jobPath: string): string | undefined {
  try {
    const jobSegments = jobPath
      .split('/')
      .filter((segment) => segment.length > 0)
      .map((segment) => `job/${segment}`)
      .join('/');
    return resolveSafeRelativeUrl(baseUrl, `/${jobSegments}/`);
  } catch {
    return undefined;
  }
}

function sameJenkinsBuildIdentity(
  jobUrl: string,
  buildNumber: number,
  buildUrl: string,
): boolean {
  try {
    const job = new URL(jobUrl);
    const build = new URL(buildUrl);
    const jobPath = job.pathname.replace(/\/+$/u, '');
    return job.origin === build.origin && !job.search && !job.hash && !build.search && !build.hash &&
      build.pathname.replace(/\/+$/u, '') === `${jobPath}/${buildNumber}`;
  } catch {
    return false;
  }
}

function validJenkinsResult(value: unknown): boolean {
  if (!isRecord(value) || !isSafePersistedUrl(value.baseUrl) || !boundedString(value.jobPath, 256) ||
    !isSafePersistedUrl(value.jobUrl) || !positiveInteger(value.buildNumber) || !isSafePersistedUrl(value.buildUrl) ||
    !boundedString(value.status, 256) || !validTrigger(value.trigger, value.baseUrl) ||
    !sameJenkinsContextUrl(value.jobUrl, value.baseUrl) ||
    !sameJenkinsJobIdentity(value.jobUrl, expectedJenkinsJobUrl(value.baseUrl, value.jobPath) ?? '') ||
    !sameJenkinsBuildIdentity(value.jobUrl, value.buildNumber, value.buildUrl)) return false;
  if (!isRecord(value.trigger) || value.trigger.build === undefined) return true;
  return isRecord(value.trigger.build) && value.trigger.build.number === value.buildNumber &&
    value.trigger.build.url === value.buildUrl;
}

function validTrigger(value: unknown, baseUrl: string): value is TriggerEvidence {
  if (!isRecord(value) || !['existing_build', 'build_now', 'job_page', 'unsupported_parameterized', 'unknown'].includes(String(value.capability)) ||
    typeof value.triggerAttempts !== 'number' || !Number.isSafeInteger(value.triggerAttempts) || value.triggerAttempts < 0 || value.triggerAttempts > 64 || !validWarnings(value.warnings)) return false;
  if (value.baselineBuildNumber !== undefined && !positiveInteger(value.baselineBuildNumber)) return false;
  if (value.queueUrl !== undefined && (!isSafePersistedUrl(value.queueUrl) || !sameJenkinsContextUrl(value.queueUrl, baseUrl))) return false;
  if (value.queueId !== undefined && !boundedString(value.queueId, 128)) return false;
  if (value.build !== undefined && !validBuild(value.build, baseUrl)) return false;
  return optionalString(value.submittedAt, 128) && optionalString(value.correlatedAt, 128);
}

function validNavigationTarget(value: unknown, expectedKey: string): value is NavigationTarget {
  if (!isRecord(value) || value.key !== expectedKey || !boundedString(value.localAnchor, 256) ||
    !['found', 'not_found', 'incomplete'].includes(String(value.state))) return false;
  return value.liveUrl === undefined || isSafePersistedUrl(value.liveUrl);
}

function validNavigation(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length !== NAVIGATION_KEYS.length) return false;
  return NAVIGATION_KEYS.every((key) => validNavigationTarget(value[key], key));
}

function validCapture(value: unknown): value is CaptureMetadata {
  if (!isRecord(value) || !isSafePersistedUrl(value.url) || !boundedString(value.capturedAt, 128) ||
    !optionalString(value.title, MAX_CAPTURE_TITLE_LENGTH) || !optionalString(value.selectorStrategy, MAX_SELECTOR_STRATEGY_LENGTH) ||
    (value.screenshotSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(String(value.screenshotSha256))) ||
    (value.screenshotPath !== undefined && (typeof value.screenshotPath !== 'string' || !isSafeScreenshotReference(value.screenshotPath)))) return false;
  if (value.viewport === undefined) return true;
  const viewport = value.viewport;
  return isRecord(viewport) && positiveInteger(viewport.width) && viewport.width <= 10_000 &&
    positiveInteger(viewport.height) && viewport.height <= 10_000;
}

function validSource(value: unknown): value is SourceEvidence {
  if (!isRecord(value) || !['found', 'not_found', 'incomplete'].includes(String(value.state)) ||
    !Array.isArray(value.captures) || value.captures.length > MAX_CAPTURE_ITEMS || !value.captures.every(validCapture) ||
    !Array.isArray(value.navigation) || value.navigation.length > MAX_SOURCE_NAVIGATION_ITEMS ||
    !value.navigation.every((item) => isRecord(item) && typeof item.key === 'string' && NAVIGATION_KEYS.includes(item.key as typeof NAVIGATION_KEYS[number]) && validNavigationTarget(item, item.key)) ||
    !validWarnings(value.warnings)) return false;
  return true;
}

function validSonarFacets(value: unknown): value is SonarIssueFacets {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !Array.isArray(value.types) || !Array.isArray(value.severities)) return false;
  const validGroup = (group: unknown): boolean => Array.isArray(group) && group.length <= 64 && group.every((item) =>
    isRecord(item) && boundedString(item.label, 128) && typeof item.count === 'number' &&
    Number.isSafeInteger(item.count) && item.count >= 0 && item.count <= 10_000_000);
  return validGroup(value.types) && validGroup(value.severities);
}

function validSonar(value: unknown): boolean {
  if (!validSource(value) || !isRecord(value)) return false;
  return value.facets === undefined || validSonarFacets(value.facets);
}

function validSnykSummary(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.counts) || !isRecord(value.detail)) return false;
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
  if (!isRecord(value.metadata)) return false;
  return optionalString(value.metadata.scannedPath, MAX_SNYK_TEXT_LENGTH) &&
    optionalString(value.metadata.packageManager, MAX_CAPTURE_TITLE_LENGTH) &&
    (value.metadata.dependencyCount === undefined || positiveInteger(value.metadata.dependencyCount) || value.metadata.dependencyCount === 0) &&
    (value.metadata.dependencyPathCount === undefined || positiveInteger(value.metadata.dependencyPathCount) || value.metadata.dependencyPathCount === 0);
}

function validSnykFinding(value: unknown): boolean {
  if (!isRecord(value) || !['critical', 'high', 'medium', 'low'].includes(String(value.severity))) return false;
  if (!optionalString(value.id, 256) || !optionalString(value.title, MAX_CAPTURE_TITLE_LENGTH) ||
    !optionalString(value.module, MAX_CAPTURE_TITLE_LENGTH) || !optionalString(value.description, MAX_SNYK_TEXT_LENGTH) ||
    !optionalString(value.remediation, MAX_SNYK_TEXT_LENGTH)) return false;
  if (value.paths !== undefined && (!Array.isArray(value.paths) || value.paths.length > MAX_SNYK_PATHS || !value.paths.every((item) => boundedString(item, MAX_SNYK_TEXT_LENGTH)))) return false;
  if (value.references !== undefined && (!Array.isArray(value.references) || value.references.length > MAX_SNYK_REFERENCES || !value.references.every(isSafeReference))) return false;
  return true;
}

function validSnyk(value: unknown): boolean {
  if (!validSource(value) || !isRecord(value)) return false;
  if (value.summary !== undefined && !validSnykSummary(value.summary)) return false;
  return value.findings === undefined || (Array.isArray(value.findings) && value.findings.length <= MAX_SNYK_FINDINGS && value.findings.every(validSnykFinding));
}

function validProject(value: unknown): value is { id: string; name: string } {
  return isRecord(value) && boundedString(value.id, 80) && boundedString(value.name, 256);
}

function validRun(value: unknown): value is { runId: string; observedAt: string } {
  return isRecord(value) && boundedString(value.runId, 96) && boundedString(value.observedAt, 128);
}

function validDiagnostics(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.observationErrors) || !validWarnings(value.observationErrors) ||
    typeof value.reloadCount !== 'number' || !Number.isSafeInteger(value.reloadCount) || value.reloadCount < 0 || !optionalString(value.lastSafeUrl, MAX_CAPTURE_URL_LENGTH) ||
    !optionalString(value.status, 256)) return false;
  return value.lastSafeUrl === undefined || isSafePersistedUrl(value.lastSafeUrl);
}

function validCommon(value: Record<string, unknown>): boolean {
  return value.schemaVersion === 2 && validProject(value.project) && validRun(value.run) && validWarnings(value.warnings) &&
    (value.diagnostic === undefined || boundedString(value.diagnostic, MAX_PERSISTED_DIAGNOSTIC_LENGTH)) &&
    (value.diagnostics === undefined || validDiagnostics(value.diagnostics));
}

export function isValidProjectResult(value: unknown): value is VulnerabilityReportResultV2 {
  if (!isRecord(value) || !validCommon(value) || !['success', 'partial'].includes(String(value.state)) ||
    !validJenkinsResult(value.jenkins) || !validNavigation(value.navigation) || !isRecord(value.reports) ||
    !validSnyk(value.reports.snyk) || !validSonar(value.reports.sonarqube)) return false;
  return true;
}

function validFailureJenkins(value: unknown): boolean {
  if (!isRecord(value) || !positiveInteger(value.buildNumber) || !isSafePersistedUrl(value.buildUrl)) return false;
  const hasBaseUrl = value.baseUrl !== undefined;
  const hasJobPath = value.jobPath !== undefined;
  const hasJobUrl = value.jobUrl !== undefined;
  if (!hasBaseUrl && !hasJobPath && !hasJobUrl) return true;
  if (!hasBaseUrl || !hasJobPath || !hasJobUrl || !isSafePersistedUrl(value.baseUrl) ||
    !boundedString(value.jobPath, 256) || !isSafePersistedUrl(value.jobUrl)) return false;
  return sameJenkinsContextUrl(value.jobUrl, value.baseUrl) &&
    sameJenkinsJobIdentity(value.jobUrl, expectedJenkinsJobUrl(value.baseUrl, value.jobPath) ?? '') &&
    sameJenkinsBuildIdentity(value.jobUrl, value.buildNumber, value.buildUrl);
}

export function isValidFailureResult(value: unknown): value is ProjectFailureResultV2 {
  if (!isRecord(value) || !validCommon(value) || value.state !== 'failed' || !boundedString(value.diagnostic, MAX_PERSISTED_DIAGNOSTIC_LENGTH)) return false;
  return value.jenkins === undefined || validFailureJenkins(value.jenkins);
}

export function assertValidProjectResult(value: unknown): asserts value is VulnerabilityReportResultV2 {
  if (!isValidProjectResult(value)) throw new Error('project result schema is invalid');
}

export function assertValidFailureResult(value: unknown): asserts value is ProjectFailureResultV2 {
  if (!isValidFailureResult(value)) throw new Error('project failure result schema is invalid');
}
