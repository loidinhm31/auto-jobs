import type { Page } from '@playwright/test';

import {
  formatDiagnostic,
  sanitizeUrl,
} from '../config-errors.js';
import type { JenkinsRunnerConfig } from './runner-config.js';

export class JenkinsFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JenkinsFlowError';
  }
}

export function formatJenkinsObservation(
  error: unknown,
  config: JenkinsRunnerConfig,
): string {
  return formatDiagnostic(error, [config.username, config.password]);
}

export function formatJenkinsFailure(
  action: string,
  error: unknown,
  config: JenkinsRunnerConfig,
  page: Page,
  fallbackUrl = config.loginUrl,
  observations: readonly string[] = [],
): string {
  const currentUrl = page.url().trim() || fallbackUrl;
  const lastObservation = observations.at(-1);
  const suffix = lastObservation === undefined
    ? ''
    : `; last observation: ${formatJenkinsObservation(lastObservation, config)}`;
  const safeUrl = formatDiagnostic(sanitizeUrl(currentUrl), [config.username, config.password]);
  return `${action} at ${safeUrl}: ${formatJenkinsObservation(error, config)}${suffix}`;
}
