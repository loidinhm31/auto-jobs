import type { Page } from '@playwright/test';

import { redactText, sanitizeUrl } from '../config-errors.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import { isSafeScreenshotReference, MAX_CAPTURE_URL_LENGTH, MAX_RUN_ARTIFACT_COUNT } from '../artifacts/result-validation.js';
import { safeSnykSource } from '../artifacts/snyk-result-sanitizer.js';
import type {
  CaptureMetadata,
  NavigationTargets,
  SnykSourceEvidence,
  SonarSourceEvidence,
  SourceEvidence,
} from '../result-types.js';
import { boundedDiagnostics } from '../workflow/diagnostics.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import type { ProjectWorkflowResult } from './project-workflow.js';
import { captureSnykEvidence, type SnykSummaryReader } from '../reports/snyk/snyk-capture.js';
import type { ScriptSafePage } from '../reports/snyk/snyk-capture-support.js';
import { captureSonarqubeEvidence } from '../reports/sonarqube/sonarqube-capture.js';
import { sanitizeSonarIssueFacets } from '../reports/sonarqube/sonarqube-issue-facets.js';
import { assertSafeReferenceUrl } from '../security/url-policy.js';
import { pageLinkCandidates } from '../reports/snyk/snyk-capture-support.js';
import { classifySnykLinks, classifySonarLinks } from '../reports/source-link-classifier.js';
import { pollUntil } from '../workflow/poll-until.js';

const ARTIFACT_LINK_SETTLE_MS = 5_000;
const MAX_ARTIFACT_LINK_SETTLE_ATTEMPTS = 32;

function publisherConfigured(
  project: NormalizedProjectConfig,
  publisher: 'snyk' | 'sonarqube',
): boolean {
  const source = project.sources[publisher];
  return source.projectId !== undefined || source.reportPath !== undefined || source.homeUrl !== undefined ||
    source.allowedOrigins.length > 0;
}

async function settleTerminalArtifactLinks(
  page: Page,
  project: NormalizedProjectConfig,
  deadline: WorkflowDeadline,
): Promise<void> {
  const settleDeadline = new WorkflowDeadline(Math.min(ARTIFACT_LINK_SETTLE_MS, deadline.requireRemaining()));
  const requiredPublishers = [
    ...(publisherConfigured(project, 'snyk') ? ['snyk'] as const : []),
    ...(publisherConfigured(project, 'sonarqube') ? ['sonarqube'] as const : []),
  ];
  if (requiredPublishers.length === 0) return;
  try {
    await pollUntil<boolean>({
      deadline: settleDeadline,
      intervalMs: Math.min(Math.max(project.pollIntervalMs, 50), 250),
      maxObservations: 16,
      maxAttempts: MAX_ARTIFACT_LINK_SETTLE_ATTEMPTS,
      observe: async () => {
        const links = await pageLinkCandidates(page);
        const snyk = classifySnykLinks(links, project);
        const sonarqube = classifySonarLinks(links, project);
        const found = {
          snyk: snyk.report !== undefined,
          sonarqube: sonarqube.home !== undefined,
        };
        const ready = requiredPublishers.length === 0
          ? found.snyk || found.sonarqube
          : requiredPublishers.every((publisher) => found[publisher]);
        if (ready) return true;
        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: Math.min(deadline.requireRemaining(), settleDeadline.requireRemaining()),
        });
        return false;
      },
      accept: Boolean,
    });
  } catch {
    // Optional publisher output may be absent; source capture retains not_found.
  }
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
  outputDirectory: string;
  snykSummaryReader?: SnykSummaryReader;
  snykOpenSafePage?: (page: Page) => Promise<ScriptSafePage>;
}) => Promise<CaptureResult>;

export const defaultCapture: EvidenceCapture = async ({ page, project, workflow, deadline, outputDirectory, snykSummaryReader, snykOpenSafePage }) => {
  await settleTerminalArtifactLinks(page, project, deadline);
  const snyk = await captureSnykEvidence({
    page,
    project,
    deadline,
    outputDirectory,
    terminalBuildUrl: workflow.terminal.build.url,
    ...(snykSummaryReader === undefined ? {} : { readSummary: snykSummaryReader }),
    ...(snykOpenSafePage === undefined ? {} : { openSafePage: snykOpenSafePage }),
  });
  const sonarqube = await captureSonarqubeEvidence({
    page,
    project,
    deadline,
    outputDirectory,
    terminalBuildUrl: workflow.terminal.build.url,
  });
  return {
    navigation: {
      'jenkins-build': { key: 'jenkins-build', localAnchor: '#jenkins', state: 'found', liveUrl: sanitizeUrl(workflow.terminal.build.url) },
      'snyk-report': snyk.navigation,
      ...sonarqube.navigation,
    },
    reports: {
      snyk: snyk.source,
      sonarqube: sonarqube.source,
    },
    warnings: [...snyk.warnings, ...sonarqube.warnings],
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
    }).slice(0, MAX_RUN_ARTIFACT_COUNT),
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
    ...(diagnostics.lastSafeUrl === undefined ? {} : { lastSafeUrl: sanitizeUrl(redactText(diagnostics.lastSafeUrl, secretValues)) }),
    ...(diagnostics.status === undefined ? {} : { status: redactText(diagnostics.status, secretValues).slice(0, 256) }),
    observationErrors: boundedDiagnostics(diagnostics.observationErrors.map((value) => redactText(value, secretValues))),
    reloadCount: diagnostics.reloadCount,
  };
}
