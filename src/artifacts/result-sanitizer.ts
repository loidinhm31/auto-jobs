import { redactText, sanitizeUrl } from '../config-errors.js';
import type {
  CaptureMetadata,
  NavigationTarget,
  SourceEvidence,
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
  MAX_RUN_ARTIFACT_COUNT,
} from './result-validation.js';
import { safeSnykSource } from './snyk-result-sanitizer.js';

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

export function assertManifestShape(manifest: ProjectRunManifest): void {
  if (manifest.artifacts.manifest !== 'manifest.json' || manifest.artifacts.data !== 'data.json' ||
    manifest.artifacts.trace !== undefined && manifest.artifacts.trace !== 'trace.zip' ||
    manifest.artifacts.screenshots.some((filename) => !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(filename))) {
    throw new Error('manifest artifact references are invalid');
  }
  if (manifest.artifacts.screenshots.length + (manifest.artifacts.trace === undefined ? 0 : 1) > MAX_RUN_ARTIFACT_COUNT ||
    !Array.isArray(manifest.warnings) || manifest.warnings.length > MAX_WARNING_ITEMS ||
    manifest.warnings.some((warning) => typeof warning !== 'string' || warning.length > MAX_WARNING_LENGTH) ||
    manifest.diagnostic !== undefined && manifest.diagnostic.length > MAX_PERSISTED_DIAGNOSTIC_LENGTH ||
    manifest.diagnostics !== undefined && (!Array.isArray(manifest.diagnostics.observationErrors) ||
      manifest.diagnostics.observationErrors.length > MAX_WARNING_ITEMS ||
      manifest.diagnostics.observationErrors.some((error) => typeof error !== 'string' || error.length > MAX_WARNING_LENGTH) ||
      !Number.isSafeInteger(manifest.diagnostics.reloadCount) || manifest.diagnostics.reloadCount < 0 ||
      manifest.diagnostics.lastSafeUrl !== undefined && !isSafePersistedUrl(manifest.diagnostics.lastSafeUrl))) {
    throw new Error('manifest diagnostics are invalid');
  }
  if (manifest.jenkins !== undefined) assertSafeBuildUrl(manifest.jenkins.buildUrl);
}

export function assertProjectIdentity(
  manifest: ProjectRunManifest,
  result: { readonly project: { readonly id: string }; readonly run: { readonly runId: string }; readonly state: string; readonly jenkins?: { readonly buildNumber: number; readonly buildUrl: string } },
): void {
  assertManifestShape(manifest);
  if (result.jenkins !== undefined) assertSafeBuildUrl(result.jenkins.buildUrl);
  if (manifest.project.id !== result.project.id || manifest.run.runId !== result.run.runId || manifest.state !== result.state) {
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
  const candidate = sanitizeUrl(value).slice(0, MAX_CAPTURE_URL_LENGTH);
  return isSafePersistedUrl(candidate) ? candidate : undefined;
}

function safeCapture(value: CaptureMetadata): CaptureMetadata {
  return {
    ...value,
    url: sanitizeUrl(redactText(value.url)).slice(0, MAX_CAPTURE_URL_LENGTH),
    capturedAt: redactText(value.capturedAt).slice(0, 128),
    ...(value.title === undefined ? {} : { title: redactText(value.title).slice(0, MAX_CAPTURE_TITLE_LENGTH) }),
    ...(value.selectorStrategy === undefined ? {} : { selectorStrategy: redactText(value.selectorStrategy).slice(0, 256) }),
    ...(value.screenshotPath === undefined ? {} : { screenshotPath: redactText(value.screenshotPath).slice(0, 128) }),
    ...(value.screenshotSha256 === undefined ? {} : { screenshotSha256: value.screenshotSha256.slice(0, 64) }),
    ...(value.viewport === undefined ? {} : { viewport: { width: value.viewport.width, height: value.viewport.height } }),
  };
}

function safeTarget(value: NavigationTarget): NavigationTarget {
  const liveUrl = value.liveUrl === undefined ? undefined : safeOptionalUrl(value.liveUrl);
  return {
    ...value,
    localAnchor: redactText(value.localAnchor).slice(0, 256),
    ...(liveUrl === undefined ? {} : { liveUrl }),
  };
}

function safeSource(value: SourceEvidence): SourceEvidence {
  return {
    ...value,
    captures: value.captures.slice(-128).map(safeCapture),
    navigation: value.navigation.slice(-32).map(safeTarget),
    warnings: safeWarnings(value.warnings),
  };
}

function safeTrigger(value: TriggerEvidence): TriggerEvidence {
  const queueUrl = value.queueUrl === undefined ? undefined : safeOptionalUrl(value.queueUrl);
  const build = value.build === undefined ? undefined : {
    ...value.build,
    url: safeOptionalUrl(value.build.url) ?? '',
    ...(value.build.queueUrl === undefined ? {} : (() => {
      const buildQueueUrl = safeOptionalUrl(value.build?.queueUrl);
      return buildQueueUrl === undefined ? {} : { queueUrl: buildQueueUrl };
    })()),
  };
  return {
    ...value,
    ...(queueUrl === undefined ? {} : { queueUrl }),
    ...(build === undefined ? {} : { build }),
    warnings: safeWarnings(value.warnings),
  };
}

export function safeManifest(value: ProjectRunManifest): ProjectRunManifest {
  const safeDiagnosticUrl = value.diagnostics?.lastSafeUrl === undefined ? undefined : safeOptionalUrl(value.diagnostics.lastSafeUrl);
  return {
    ...value,
    ...(value.jenkins === undefined ? {} : { jenkins: {
      ...value.jenkins, buildUrl: sanitizeUrl(value.jenkins.buildUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
      ...(value.jenkins.status === undefined ? {} : { status: redactText(value.jenkins.status).slice(0, 256) }),
    } }),
    warnings: safeWarnings(value.warnings),
    ...(value.diagnostic === undefined ? {} : { diagnostic: redactText(value.diagnostic).slice(0, MAX_PERSISTED_DIAGNOSTIC_LENGTH) }),
    ...(value.diagnostics === undefined ? {} : { diagnostics: {
      ...value.diagnostics,
      ...(safeDiagnosticUrl === undefined ? {} : { lastSafeUrl: safeDiagnosticUrl }),
      ...(value.diagnostics.status === undefined ? {} : { status: redactText(value.diagnostics.status).slice(0, 256) }),
      observationErrors: safeWarnings(value.diagnostics.observationErrors),
    } }),
  };
}

export function safeResult(value: VulnerabilityReportResultV2): VulnerabilityReportResultV2 {
  return {
    ...value,
    jenkins: {
      ...value.jenkins,
      baseUrl: sanitizeUrl(value.jenkins.baseUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
      jobPath: redactText(value.jenkins.jobPath).slice(0, 256),
      jobUrl: sanitizeUrl(value.jenkins.jobUrl).slice(0, MAX_CAPTURE_URL_LENGTH),
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
      sonarqube: safeSource(value.reports.sonarqube),
    },
    warnings: safeWarnings(value.warnings),
  };
}

export function safeFailure(value: ProjectFailureResultV2): ProjectFailureResultV2 {
  const safeDiagnosticUrl = value.diagnostics?.lastSafeUrl === undefined ? undefined : safeOptionalUrl(value.diagnostics.lastSafeUrl);
  return {
    ...value,
    diagnostic: redactText(value.diagnostic).slice(0, MAX_PERSISTED_DIAGNOSTIC_LENGTH),
    warnings: safeWarnings(value.warnings),
    ...(value.diagnostics === undefined ? {} : { diagnostics: {
      ...value.diagnostics,
      ...(safeDiagnosticUrl === undefined ? {} : { lastSafeUrl: safeDiagnosticUrl }),
      observationErrors: safeWarnings(value.diagnostics.observationErrors),
    } }),
  };
}

export { assertValidFailureResult, assertValidProjectResult };
