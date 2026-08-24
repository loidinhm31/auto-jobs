import type { Page } from '@playwright/test';

import { redactText, sanitizeUrl } from '../config-errors.js';
import type { NormalizedProjectConfig, ProjectSecrets } from '../config/config-types.js';
import type { NavigationTargets, SourceEvidence } from '../result-types.js';
import { boundedDiagnostics } from '../workflow/diagnostics.js';
import type { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import type { ProjectWorkflowResult } from './project-workflow.js';

export interface CaptureResult {
  readonly navigation: NavigationTargets;
  readonly reports: { readonly sonarqube: SourceEvidence; readonly snyk: SourceEvidence };
  readonly warnings: readonly string[];
}

export type EvidenceCapture = (input: {
  page: Page;
  project: NormalizedProjectConfig;
  workflow: ProjectWorkflowResult;
  deadline: WorkflowDeadline;
  outputDirectory: string;
}) => Promise<CaptureResult>;

function incompleteSource(message: string): SourceEvidence {
  return { state: 'incomplete', captures: [], navigation: [], warnings: [message] };
}

export const defaultCapture: EvidenceCapture = async ({ workflow }) => ({
  navigation: {
    'jenkins-build': { key: 'jenkins-build', localAnchor: '#jenkins', state: 'found', liveUrl: sanitizeUrl(workflow.terminal.build.url) },
    'snyk-report': { key: 'snyk-report', localAnchor: '#snyk-test-report', state: 'incomplete' },
    'sonarqube-home': { key: 'sonarqube-home', localAnchor: '#sonarqube-overall', state: 'incomplete' },
    'sonarqube-overall': { key: 'sonarqube-overall', localAnchor: '#sonarqube-overall', state: 'incomplete' },
    'sonarqube-issues': { key: 'sonarqube-issues', localAnchor: '#sonarqube-issues', state: 'incomplete' },
  },
  reports: {
    snyk: incompleteSource('Snyk capture is pending Phase 4'),
    sonarqube: incompleteSource('SonarQube capture is pending Phase 5'),
  },
  warnings: ['Source capture adapters are not installed'],
});

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
      url: sanitizeUrl(redactText(capture.url, secrets)),
      capturedAt: redactText(capture.capturedAt, secrets).slice(0, 128),
      ...(capture.title === undefined ? {} : { title: redactText(capture.title, secrets).slice(0, 512) }),
      ...(capture.selectorStrategy === undefined ? {} : { selectorStrategy: redactText(capture.selectorStrategy, secrets).slice(0, 256) }),
      ...(capture.screenshotPath === undefined ? {} : { screenshotPath: redactText(capture.screenshotPath, secrets).slice(0, 128) }),
    })),
    navigation: source.navigation.map((target) => ({
      ...target,
      ...(target.liveUrl === undefined ? {} : { liveUrl: sanitizeUrl(redactText(target.liveUrl, secrets)) }),
    })),
    warnings: boundedDiagnostics(source.warnings.map((warning) => redactText(warning, secrets))),
  };
}

export function sanitizeCaptureResult(
  capture: CaptureResult,
  secrets: ProjectSecrets,
): CaptureResult {
  const secretValues = [secrets.username, secrets.password];
  return {
    navigation: Object.fromEntries(Object.entries(capture.navigation).map(([key, target]) => [key, {
      ...target,
      ...(target.liveUrl === undefined ? {} : { liveUrl: sanitizeUrl(redactText(target.liveUrl, secretValues)) }),
    }])) as NavigationTargets,
    reports: {
      snyk: safeSource(capture.reports.snyk, secretValues),
      sonarqube: safeSource(capture.reports.sonarqube, secretValues),
    },
    warnings: boundedDiagnostics(capture.warnings.map((warning) => redactText(warning, secretValues))),
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
