import type { Page } from '@playwright/test';

import { redactText, sanitizeUrl } from '../config-errors.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import { isSafeScreenshotReference, MAX_CAPTURE_URL_LENGTH, MAX_RUN_OPTIONAL_ARTIFACT_COUNT } from '../artifacts/result-validation.js';
import { safeSnykSource } from '../artifacts/snyk-result-sanitizer.js';
import type {
  CaptureMetadata,
  NavigationTargets,
  SnykSourceEvidence,
  SonarSourceEvidence,
  SourceEvidence,
} from '../result-types.js';
import { boundedDiagnostics, pushDiagnostic } from '../workflow/diagnostics.js';
import type { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import type { ProjectRunState } from './project-run-state.js';
import type { ProjectWorkflowResult } from './project-workflow.js';
import { captureSnykEvidence, type SnykSummaryReader } from '../reports/snyk/snyk-capture.js';
import type { ScriptSafePage } from '../reports/snyk/snyk-capture-support.js';
import { captureSonarqubeEvidence } from '../reports/sonarqube/sonarqube-capture.js';
import { sanitizeSonarIssueFacets } from '../reports/sonarqube/sonarqube-issue-facets.js';
import { assertAllowedUrl, assertSafeReferenceUrl } from '../security/url-policy.js';
import { pageLinkCandidatesWithStatus } from '../reports/snyk/snyk-capture-support.js';
import { classifySnykLinks, classifySonarLinks, type SnykLinkClassification, type SonarLinkClassification } from '../reports/source-link-classifier.js';

const LINK_DISCOVERY_TRUNCATED_WARNING = 'job page link discovery exceeded the bounded link limit; the one-Snyk/one-Sonar-per-job rule could not be proven';


function publisherConfigured(
  project: NormalizedProjectConfig,
  publisher: 'snyk' | 'sonarqube',
): boolean {
  const source = project.sources[publisher];
  return source.projectId !== undefined || source.allowedOrigins.length > 0;
}
function discoverWarnings(
  project: NormalizedProjectConfig,
  snyk: SnykLinkClassification,
  sonarqube: SonarLinkClassification,
  truncated: boolean,
): string[] {
  const warnings: string[] = [...snyk.warnings, ...sonarqube.warnings];
  if (truncated) pushDiagnostic(warnings, LINK_DISCOVERY_TRUNCATED_WARNING);
  if (publisherConfigured(project, 'snyk')) {
    if (snyk.report === undefined) pushDiagnostic(warnings, 'Snyk report destination cardinality was not exactly one');
    if (snyk.summary === undefined) pushDiagnostic(warnings, 'Snyk summary destination cardinality was not exactly one');
  }
  if (publisherConfigured(project, 'sonarqube') && sonarqube.home === undefined) {
    pushDiagnostic(warnings, 'SonarQube destination cardinality was not exactly one');
  }
  return boundedDiagnostics(warnings);
}

export interface CaptureResult {
  readonly navigation: NavigationTargets;
  readonly reports: { readonly sonarqube: SonarSourceEvidence; readonly snyk: SnykSourceEvidence };
  readonly warnings: readonly string[];
  readonly artifacts?: { readonly screenshots: readonly string[] };
}

export type EvidenceCapture = (input: {
  page: Page;
  project: NormalizedProjectConfig;
  workflow: ProjectWorkflowResult;
  deadline: WorkflowDeadline;
  state: ProjectRunState;
  outputDirectory: string;
  snykSummaryReader?: SnykSummaryReader;
  snykOpenSafePage?: (page: Page, deadline: WorkflowDeadline) => Promise<ScriptSafePage>;
  secrets?: ProjectSecrets;
}) => Promise<CaptureResult>;

export const defaultCapture: EvidenceCapture = async ({
  page,
  project,
  workflow,
  deadline,
  state,
  outputDirectory,
  snykSummaryReader,
  snykOpenSafePage,
  secrets,
}) => {
  const linkCollection = await pageLinkCandidatesWithStatus(page, deadline);
  const links = linkCollection.truncated ? [] : linkCollection.candidates;
  const truncationWarnings = linkCollection.truncated ? [LINK_DISCOVERY_TRUNCATED_WARNING] : [];
  const snykLinks = classifySnykLinks(links, project);
  const sonarqubeLinks = classifySonarLinks(links, project);
  const discoveryWarnings = discoverWarnings(project, snykLinks, sonarqubeLinks, linkCollection.truncated);
  state.transition('links_discovered');

  const snyk = await captureSnykEvidence({
    page,
    project,
    deadline,
    outputDirectory,
    ...(snykLinks.report === undefined ? {} : { reportUrl: snykLinks.report.href }),
    ...(snykLinks.summary === undefined ? {} : { summaryUrl: snykLinks.summary.href }),
    discoveryWarnings: [
      ...snykLinks.warnings,
      ...truncationWarnings,
      ...(snykLinks.report === undefined ? ['Snyk report destination cardinality was not exactly one'] : []),
      ...(snykLinks.summary === undefined ? ['Snyk summary destination cardinality was not exactly one'] : []),
    ],
    ...(snykSummaryReader === undefined ? {} : { readSummary: snykSummaryReader }),
    ...(snykOpenSafePage === undefined ? {} : { openSafePage: snykOpenSafePage }),
  });
  const sonarqube = await captureSonarqubeEvidence({
    page,
    project,
    deadline,
    outputDirectory,
    ...(sonarqubeLinks.home === undefined ? {} : { homeUrl: sonarqubeLinks.home.href }),
    discoveryWarnings: [
      ...sonarqubeLinks.warnings,
      ...truncationWarnings,
      ...(sonarqubeLinks.home === undefined ? ['SonarQube destination cardinality was not exactly one'] : []),
    ],
    ...(secrets === undefined ? {} : { secrets }),
  });

  state.transition('captured');
  return {
    navigation: {
      'jenkins-job': { key: 'jenkins-job', localAnchor: '#jenkins', state: 'found', liveUrl: sanitizeUrl(workflow.jobUrl) },
      'snyk-report': snyk.navigation,
      ...sonarqube.navigation,
    },
    reports: {
      snyk: snyk.source,
      sonarqube: sonarqube.source,
    },
    warnings: boundedDiagnostics([
      ...(workflow.diagnostics?.observationErrors ?? []),
      ...discoveryWarnings,
      ...snyk.warnings,
      ...sonarqube.warnings,
    ]),
    artifacts: { screenshots: [...snyk.screenshots, ...sonarqube.screenshots] },
  };
};

export function outcomeState(capture: CaptureResult): 'success' | 'partial' {
  return capture.reports.snyk.state === 'found' &&
    capture.reports.sonarqube.state === 'found' && capture.warnings.length === 0
    ? 'success'
    : 'partial';
}

function safeSource(source: SourceEvidence, secrets: readonly string[]): SourceEvidence {
  return {
    ...source,
    captures: source.captures.map((capture) => ({
      ...capture,
      url: safeSourceUrl(capture.url, secrets),
      capturedAt: redactText(capture.capturedAt, secrets).slice(0, 128),
      ...(capture.title === undefined ? {} : { title: redactText(capture.title, secrets).slice(0, 512) }),
      ...(capture.selectorStrategy === undefined ? {} : { selectorStrategy: redactText(capture.selectorStrategy, secrets).slice(0, 256) }),
      ...(capture.screenshotPath === undefined ? {} : { screenshotPath: redactText(capture.screenshotPath, secrets).slice(0, 128) }),
      ...(capture.screenshotSha256 === undefined ? {} : { screenshotSha256: capture.screenshotSha256.slice(0, 64) }),
    })),
    navigation: source.navigation.map((target) => ({
      ...target,
      ...(target.liveUrl === undefined ? {} : { liveUrl: safeSourceUrl(target.liveUrl, secrets) }),
    })),
    warnings: boundedDiagnostics(source.warnings.map((warning) => redactText(warning, secrets))),
  };
}

function safeSourceUrl(value: string, secrets: readonly string[]): string {
  const redacted = redactText(value, secrets);
  try { return assertSafeReferenceUrl(redacted).slice(0, MAX_CAPTURE_URL_LENGTH); }
  catch { return sanitizeUrl(redacted).slice(0, MAX_CAPTURE_URL_LENGTH); }
}

function safeSonarSource(source: SonarSourceEvidence, secrets: readonly string[]): SonarSourceEvidence {
  return {
    ...safeSource(source, secrets),
    ...(source.facets === undefined ? {} : {
      facets: sanitizeSonarIssueFacets(source.facets, (value) => redactText(value, secrets)),
    }),
  };
}

function safeArtifacts(capture: CaptureResult): CaptureResult['artifacts'] | undefined {
  if (capture.artifacts === undefined) return undefined;
  const seen = new Set<string>();
  return {
    screenshots: capture.artifacts.screenshots.filter((filename) => {
      if (!isSafeScreenshotReference(filename) || seen.has(filename)) return false;
      seen.add(filename);
      return true;
    }).slice(0, MAX_RUN_OPTIONAL_ARTIFACT_COUNT),
  };
}

export function sanitizeCaptureResult(
  capture: CaptureResult,
  secrets: ProjectSecrets,
): CaptureResult {
  const secretValues = [secrets.username, secrets.password];
  const artifacts = safeArtifacts(capture);
  return {
    navigation: Object.fromEntries(Object.entries(capture.navigation).map(([key, target]) => [key, {
      ...target,
      ...(target.liveUrl === undefined ? {} : { liveUrl: safeSourceUrl(target.liveUrl, secretValues) }),
    }])) as NavigationTargets,
    reports: {
      snyk: safeSnykSource(capture.reports.snyk, (source) => safeSource(source, secretValues), (value) => redactText(value, secretValues)),
      sonarqube: safeSonarSource(capture.reports.sonarqube, secretValues),
    },
    warnings: boundedDiagnostics(capture.warnings.map((warning) => redactText(warning, secretValues))),
    ...(artifacts === undefined ? {} : { artifacts }),
  };
}

export function sanitizeProjectDiagnostics(
  diagnostics: ProjectWorkflowResult['diagnostics'],
  secrets: ProjectSecrets,
): ProjectWorkflowResult['diagnostics'] {
  if (diagnostics === undefined) return undefined;
  const secretValues = [secrets.username, secrets.password];
  return {
    ...(diagnostics.lastSafeUrl === undefined ? {} : { lastSafeUrl: safeSourceUrl(diagnostics.lastSafeUrl, secretValues) }),
    observationErrors: boundedDiagnostics(diagnostics.observationErrors.map((value) => redactText(value, secretValues))),
  };
}
