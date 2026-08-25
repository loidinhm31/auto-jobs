import { redactText, sanitizeUrl } from '../config-errors.js';
import type {
  CaptureMetadata,
  NavigationTarget,
  SourceEvidence,
  SonarSourceEvidence,
  TriggerEvidence,
  VulnerabilityReportResultV2,
} from '../result-types.js';
import type { ProjectFailureResultV2, ProjectRunManifest } from './artifact-manifest.js';
import {
  assertValidFailureResult,
  assertValidProjectResult,
  isSafePersistedUrl,
  MAX_CAPTURE_TITLE_LENGTH,
  MAX_CAPTURE_URL_LENGTH,
  MAX_PERSISTED_DIAGNOSTIC_LENGTH,
  MAX_PERSISTED_WARNING_ITEMS,
  MAX_PERSISTED_WARNING_LENGTH,
  isSafeScreenshotReference,
  MAX_RUN_ARTIFACT_COUNT,
} from './result-validation.js';
import { safeSnykSource } from './snyk-result-sanitizer.js';
import { sanitizeSonarIssueFacets } from '../reports/sonarqube/sonarqube-issue-facets.js';
import { assertSafeReferenceUrl } from '../security/url-policy.js';

const MAX_WARNING_ITEMS = MAX_PERSISTED_WARNING_ITEMS;
const MAX_WARNING_LENGTH = MAX_PERSISTED_WARNING_LENGTH;

export function assertSafeBuildUrl(value: string): void {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('unsafe build URL');
  } catch {
    throw new Error('build URL must be an HTTP(S) URL without credentials or fragments');
  }
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

export function assertManifestContract(manifest: ProjectRunManifest): void {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest) ||
    manifest.kind !== 'project-run' || manifest.schemaVersion !== 2 ||
    typeof manifest.project !== 'object' || manifest.project === null ||
    typeof manifest.project.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(manifest.project.id) || !boundedText(manifest.project.name, 256) ||
    typeof manifest.run !== 'object' || manifest.run === null ||
    typeof manifest.run.runId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/u.test(manifest.run.runId) || !boundedText(manifest.run.observedAt, 128) ||
    !['success', 'partial', 'failed'].includes(manifest.state) ||
    typeof manifest.artifacts !== 'object' || manifest.artifacts === null ||
    manifest.artifacts.manifest !== 'manifest.json' || manifest.artifacts.data !== 'data.json' ||
    !Array.isArray(manifest.artifacts.screenshots) ||
    !Array.isArray(manifest.warnings) || manifest.warnings.length > MAX_WARNING_ITEMS ||
    manifest.warnings.some((warning) => typeof warning !== 'string' || warning.length > MAX_WARNING_LENGTH) ||
    manifest.diagnostic !== undefined && (typeof manifest.diagnostic !== 'string' || manifest.diagnostic.length > MAX_PERSISTED_DIAGNOSTIC_LENGTH)) {
    throw new Error('manifest contract is invalid');
  }
  if (manifest.jenkins !== undefined) {
    if (typeof manifest.jenkins !== 'object' || manifest.jenkins === null ||
      !Number.isSafeInteger(manifest.jenkins.buildNumber) || manifest.jenkins.buildNumber < 1 ||
      typeof manifest.jenkins.buildUrl !== 'string' ||
      manifest.jenkins.status !== undefined && typeof manifest.jenkins.status !== 'string') {
      throw new Error('manifest Jenkins identity is invalid');
    }
    assertSafeBuildUrl(manifest.jenkins.buildUrl);
  }
  if (manifest.diagnostics !== undefined && (!Array.isArray(manifest.diagnostics.observationErrors) ||
    manifest.diagnostics.observationErrors.length > MAX_WARNING_ITEMS ||
    manifest.diagnostics.observationErrors.some((error) => typeof error !== 'string' || error.length > MAX_WARNING_LENGTH) ||
    !Number.isSafeInteger(manifest.diagnostics.reloadCount) || manifest.diagnostics.reloadCount < 0 ||
    manifest.diagnostics.lastSafeUrl !== undefined && !isSafePersistedUrl(manifest.diagnostics.lastSafeUrl) ||
    manifest.diagnostics.status !== undefined && typeof manifest.diagnostics.status !== 'string')) {
    throw new Error('manifest diagnostics are invalid');
  }
}

export function assertManifestShape(manifest: ProjectRunManifest): void {
  assertManifestContract(manifest);
  if (manifest.artifacts.trace !== undefined && manifest.artifacts.trace !== 'trace.zip' ||
    manifest.artifacts.screenshots.length + (manifest.artifacts.trace === undefined ? 0 : 1) > MAX_RUN_ARTIFACT_COUNT ||
    manifest.artifacts.screenshots.some((filename) => !isSafeScreenshotReference(filename)) ||
    new Set(manifest.artifacts.screenshots).size !== manifest.artifacts.screenshots.length) {
    throw new Error('manifest artifact references are invalid');
  }
}

export function assertProjectIdentity(
  manifest: ProjectRunManifest,
  result: { readonly project: { readonly id: string; readonly name: string }; readonly run: { readonly runId: string; readonly observedAt: string }; readonly state: string; readonly jenkins?: { readonly buildNumber: number; readonly buildUrl: string } },
  allowUnsafeArtifactReferences = false,
): void {
  if (allowUnsafeArtifactReferences) assertManifestContract(manifest);
  else assertManifestShape(manifest);
  if (result.jenkins !== undefined) assertSafeBuildUrl(result.jenkins.buildUrl);
  if (manifest.project.id !== result.project.id || manifest.project.name !== result.project.name ||
    manifest.run.runId !== result.run.runId || manifest.run.observedAt !== result.run.observedAt || manifest.state !== result.state) {
    throw new Error('manifest and result identities do not match');
  }
  if (manifest.jenkins !== undefined || result.jenkins !== undefined) {
    if (manifest.jenkins === undefined || result.jenkins === undefined ||
      manifest.jenkins.buildNumber !== result.jenkins.buildNumber || manifest.jenkins.buildUrl !== result.jenkins.buildUrl) {
      throw new Error('manifest and result build identities do not match');
    }
  }
}

function safeWarnings(values: readonly string[]): string[] {
  return values.slice(-MAX_WARNING_ITEMS).map((value) => redactText(value).slice(0, MAX_WARNING_LENGTH));
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

function safeTrigger(value: TriggerEvidence): TriggerEvidence {
  const queueUrl = value.queueUrl === undefined ? undefined : safeOptionalUrl(value.queueUrl);
  const build = value.build === undefined ? undefined : {
    number: value.build.number,
    url: safeOptionalUrl(value.build.url) ?? '',
    ...(value.build.queueUrl === undefined ? {} : (() => {
      const buildQueueUrl = safeOptionalUrl(value.build?.queueUrl);
      return buildQueueUrl === undefined ? {} : { queueUrl: buildQueueUrl };
    })()),
  };
  return {
    capability: value.capability,
    triggerAttempts: value.triggerAttempts,
    ...(value.baselineBuildNumber === undefined ? {} : { baselineBuildNumber: value.baselineBuildNumber }),
    ...(queueUrl === undefined ? {} : { queueUrl }),
    ...(value.queueId === undefined ? {} : { queueId: redactText(value.queueId).slice(0, 128) }),
    ...(build === undefined ? {} : { build }),
    ...(value.submittedAt === undefined ? {} : { submittedAt: redactText(value.submittedAt).slice(0, 128) }),
    ...(value.correlatedAt === undefined ? {} : { correlatedAt: redactText(value.correlatedAt).slice(0, 128) }),
    warnings: safeWarnings(value.warnings),
  };
}

function safeDiagnostics(value: NonNullable<ProjectRunManifest['diagnostics']>): NonNullable<ProjectRunManifest['diagnostics']> {
  const lastSafeUrl = value.lastSafeUrl === undefined ? undefined : safeOptionalUrl(value.lastSafeUrl);
  return {
    observationErrors: safeWarnings(value.observationErrors),
    reloadCount: value.reloadCount,
    ...(lastSafeUrl === undefined ? {} : { lastSafeUrl }),
    ...(value.status === undefined ? {} : { status: redactText(value.status).slice(0, 256) }),
  };
}

export function safeManifest(value: ProjectRunManifest): ProjectRunManifest {
  return {
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    project: { id: value.project.id, name: redactText(value.project.name).slice(0, 256) },
    run: { runId: value.run.runId, observedAt: redactText(value.run.observedAt).slice(0, 128) },
    state: value.state,
    ...(value.jenkins === undefined ? {} : { jenkins: {
      buildNumber: value.jenkins.buildNumber,
      buildUrl: sanitizeUrl(value.jenkins.buildUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
      ...(value.jenkins.status === undefined ? {} : { status: redactText(value.jenkins.status).slice(0, 256) }),
    } }),
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

export function safeResult(value: VulnerabilityReportResultV2): VulnerabilityReportResultV2 {
  return {
    schemaVersion: 2,
    state: value.state,
    project: { id: value.project.id, name: redactText(value.project.name).slice(0, 256) },
    run: { runId: value.run.runId, observedAt: redactText(value.run.observedAt).slice(0, 128) },
    jenkins: {
      baseUrl: sanitizeUrl(value.jenkins.baseUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
      jobPath: redactText(value.jenkins.jobPath).slice(0, 256),
      jobUrl: sanitizeUrl(value.jenkins.jobUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
      buildNumber: value.jenkins.buildNumber,
      buildUrl: sanitizeUrl(value.jenkins.buildUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
      status: redactText(value.jenkins.status).slice(0, 256),
      trigger: safeTrigger(value.jenkins.trigger),
    },
    navigation: {
      'jenkins-build': safeTarget(value.navigation['jenkins-build']),
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

export function safeFailure(value: ProjectFailureResultV2): ProjectFailureResultV2 {
  return {
    schemaVersion: 2,
    project: { id: value.project.id, name: redactText(value.project.name).slice(0, 256) },
    run: { runId: value.run.runId, observedAt: redactText(value.run.observedAt).slice(0, 128) },
    state: 'failed',
    ...(value.jenkins === undefined ? {} : { jenkins: {
      buildNumber: value.jenkins.buildNumber,
      buildUrl: sanitizeUrl(value.jenkins.buildUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
    } }),
    diagnostic: redactText(value.diagnostic).slice(0, MAX_PERSISTED_DIAGNOSTIC_LENGTH),
    warnings: safeWarnings(value.warnings),
    ...(value.diagnostics === undefined ? {} : { diagnostics: safeDiagnostics(value.diagnostics) }),
  };
}

export { assertValidFailureResult, assertValidProjectResult };
