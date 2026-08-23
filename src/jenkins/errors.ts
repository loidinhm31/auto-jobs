import type { Page } from '@playwright/test';

import {
  formatDiagnostic,
  sanitizeUrl,
  resolveBasePathUrl,
} from '../config.js';
import type { RunnerConfig } from '../config.js';

export class JenkinsFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JenkinsFlowError';
  }
}

export function formatJenkinsObservation(
  error: unknown,
  config: RunnerConfig,
): string {
  return formatDiagnostic(error, [config.username, config.password]);
}

export function formatJenkinsFailure(
  action: string,
  error: unknown,
  config: RunnerConfig,
  page: Page,
  fallbackUrl = resolveBasePathUrl(config.baseUrl, config.loginPath),
  observations: readonly string[] = [],
): string {
  const currentUrl = page.url().trim() || fallbackUrl;
  const lastObservation = observations.at(-1);
  const suffix = lastObservation === undefined
    ? ''
    : `; last observation: ${formatJenkinsObservation(lastObservation, config)}`;
  return `${action} at ${sanitizeUrl(currentUrl)}: ${formatJenkinsObservation(error, config)}${suffix}`;
}
