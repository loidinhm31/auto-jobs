import { redactText, sanitizeUrl } from '../config-errors.js';
import type {
  CaptureMetadata,
  NavigationTarget,
  SourceEvidence,
  SonarSourceEvidence,
  VulnerabilityReportResultV3,
} from '../result-types.js';
import type { ProjectFailureResultV3, ProjectRunManifest } from './artifact-manifest.js';
import {
  assertValidFailureResult,
  assertValidProjectResult,
  isSafePersistedUrl,
  isValidManifestContract,
  MAX_CAPTURE_TITLE_LENGTH,
  MAX_CAPTURE_URL_LENGTH,
  MAX_PERSISTED_DIAGNOSTIC_LENGTH,
  sanitizePersistedWarnings,
} from './result-validation.js';
import { safeSnykSource } from './snyk-result-sanitizer.js';
import { sanitizeSonarIssueFacets } from '../reports/sonarqube/sonarqube-issue-facets.js';
import { assertSafeReferenceUrl } from '../security/url-policy.js';

export function assertManifestContract(manifest: ProjectRunManifest): void {
  if (!isValidManifestContract(manifest, { allowUnsafeArtifactReferences: true })) {
    throw new Error('manifest contract is invalid');
  }
}

export function assertManifestShape(manifest: ProjectRunManifest): void {
  if (!isValidManifestContract(manifest, { allowUnsafeArtifactReferences: true })) {
    throw new Error('manifest contract is invalid');
  }
  if (!isValidManifestContract(manifest)) throw new Error('manifest artifact references are invalid');
}
function safeJobUrl(value: string): string {
  const candidate = safeOptionalUrl(value);
  if (candidate === undefined) throw new Error('Jenkins job URL is unsafe');
  const url = new URL(candidate);
  if (url.search || url.hash) throw new Error('Jenkins job URL must not contain query or fragment');
  return candidate;
}

export function assertProjectIdentity(
  manifest: ProjectRunManifest,
  result: Pick<VulnerabilityReportResultV3 | ProjectFailureResultV3, 'project' | 'run' | 'state' | 'jenkins'>,
  allowUnsafeArtifactReferences = false,
): void {
  if (allowUnsafeArtifactReferences) assertManifestContract(manifest);
  else assertManifestShape(manifest);
  if (result.jenkins !== undefined) safeJobUrl(result.jenkins.jobUrl);
  if (manifest.project.id !== result.project.id || manifest.project.name !== result.project.name ||
    manifest.run.runId !== result.run.runId || manifest.run.observedAt !== result.run.observedAt || manifest.state !== result.state) {
    throw new Error('manifest and result identities do not match');
  }
  if (manifest.jenkins !== undefined || result.jenkins !== undefined) {
    if (manifest.jenkins === undefined || result.jenkins === undefined || manifest.jenkins.jobUrl !== result.jenkins.jobUrl) {
      throw new Error('manifest and result Jenkins job identities do not match');
    }
  }
}

function safeWarnings(values: readonly string[]): string[] {
  return sanitizePersistedWarnings(values);
}

function safeOptionalUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let candidate: string;
  try { candidate = assertSafeReferenceUrl(value).slice(0, MAX_CAPTURE_URL_LENGTH); }
  catch { candidate = sanitizeUrl(value).slice(0, MAX_CAPTURE_URL_LENGTH); }
  return isSafePersistedUrl(candidate) ? candidate : undefined;
}

function safeCapture(value: CaptureMetadata): CaptureMetadata {
  const screenshotPath = value.screenshotPath === undefined ? undefined : redactText(value.screenshotPath).slice(0, 128);
  return {
    url: safeOptionalUrl(redactText(value.url)) ?? sanitizeUrl(redactText(value.url)).slice(0, MAX_CAPTURE_URL_LENGTH),
    capturedAt: redactText(value.capturedAt).slice(0, 128),
    ...(value.title === undefined ? {} : { title: redactText(value.title).slice(0, MAX_CAPTURE_TITLE_LENGTH) }),
    ...(value.selectorStrategy === undefined ? {} : { selectorStrategy: redactText(value.selectorStrategy).slice(0, 256) }),
    ...(screenshotPath === undefined ? {} : { screenshotPath }),
    ...(value.screenshotSha256 === undefined ? {} : { screenshotSha256: value.screenshotSha256.slice(0, 64) }),
    ...(value.viewport === undefined ? {} : { viewport: { width: value.viewport.width, height: value.viewport.height } }),
  };
}

function safeTarget(value: NavigationTarget): NavigationTarget {
  const liveUrl = value.liveUrl === undefined ? undefined : safeOptionalUrl(value.liveUrl);
  return {
    key: value.key,
    localAnchor: redactText(value.localAnchor).slice(0, 256),
    state: value.state,
    ...(liveUrl === undefined ? {} : { liveUrl }),
  };
}

function safeSource(value: SourceEvidence): SourceEvidence {
  return {
    state: value.state,
    captures: value.captures.slice(-128).map(safeCapture),
    navigation: value.navigation.slice(-32).map(safeTarget),
    warnings: safeWarnings(value.warnings),
  };
}

function safeSonarSource(value: SonarSourceEvidence): SonarSourceEvidence {
  return {
    ...safeSource(value),
    ...(value.facets === undefined ? {} : { facets: sanitizeSonarIssueFacets(value.facets, (item) => redactText(item)) }),
  };
}

function safeDiagnostics(value: NonNullable<ProjectRunManifest['diagnostics']>): NonNullable<ProjectRunManifest['diagnostics']> {
  const lastSafeUrl = value.lastSafeUrl === undefined ? undefined : safeOptionalUrl(value.lastSafeUrl);
  return {
    observationErrors: safeWarnings(value.observationErrors),
    ...(lastSafeUrl === undefined ? {} : { lastSafeUrl }),
  };
}

export function safeManifest(value: ProjectRunManifest): ProjectRunManifest {
  return {
    kind: 'project-run',
    schemaVersion: 3,
    project: { id: value.project.id, name: redactText(value.project.name).slice(0, 256) },
    run: { runId: value.run.runId, observedAt: redactText(value.run.observedAt).slice(0, 128) },
    state: value.state,
    ...(value.jenkins === undefined ? {} : { jenkins: { jobUrl: safeJobUrl(value.jenkins.jobUrl).slice(0, MAX_CAPTURE_URL_LENGTH) } }),
    artifacts: {
      manifest: 'manifest.json',
      data: 'data.json',
      screenshots: [...value.artifacts.screenshots],
      ...(value.artifacts.trace === undefined ? {} : { trace: 'trace.zip' as const }),
    },
    warnings: safeWarnings(value.warnings),
    ...(value.diagnostic === undefined ? {} : { diagnostic: redactText(value.diagnostic).slice(0, MAX_PERSISTED_DIAGNOSTIC_LENGTH) }),
    ...(value.diagnostics === undefined ? {} : { diagnostics: safeDiagnostics(value.diagnostics) }),
  };
}

export function safeResult(value: VulnerabilityReportResultV3): VulnerabilityReportResultV3 {
  return {
    schemaVersion: 3,
    state: value.state,
    project: { id: value.project.id, name: redactText(value.project.name).slice(0, 256) },
    run: { runId: value.run.runId, observedAt: redactText(value.run.observedAt).slice(0, 128) },
    jenkins: { jobUrl: safeJobUrl(value.jenkins.jobUrl).slice(0, MAX_CAPTURE_URL_LENGTH) },
    navigation: {
      'jenkins-job': safeTarget(value.navigation['jenkins-job']),
      'snyk-report': safeTarget(value.navigation['snyk-report']),
      'sonarqube-home': safeTarget(value.navigation['sonarqube-home']),
      'sonarqube-overall': safeTarget(value.navigation['sonarqube-overall']),
      'sonarqube-issues': safeTarget(value.navigation['sonarqube-issues']),
    },
    reports: {
      snyk: safeSnykSource(value.reports.snyk, safeSource),
      sonarqube: safeSonarSource(value.reports.sonarqube),
    },
    warnings: safeWarnings(value.warnings),
  };
}

export function safeFailure(value: ProjectFailureResultV3): ProjectFailureResultV3 {
  return {
    schemaVersion: 3,
    project: { id: value.project.id, name: redactText(value.project.name).slice(0, 256) },
    run: { runId: value.run.runId, observedAt: redactText(value.run.observedAt).slice(0, 128) },
    state: 'failed',
    ...(value.jenkins === undefined ? {} : { jenkins: { jobUrl: safeJobUrl(value.jenkins.jobUrl).slice(0, MAX_CAPTURE_URL_LENGTH) } }),
    diagnostic: redactText(value.diagnostic).slice(0, MAX_PERSISTED_DIAGNOSTIC_LENGTH),
    warnings: safeWarnings(value.warnings),
    ...(value.diagnostics === undefined ? {} : { diagnostics: safeDiagnostics(value.diagnostics) }),
  };
}

export { assertValidFailureResult, assertValidProjectResult };
