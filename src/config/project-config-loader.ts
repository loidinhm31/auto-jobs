import * as path from 'node:path';

import { ConfigError } from '../config-errors.js';
import {
  deriveJenkinsBaseUrl,
  normalizeConfiguredUrl,
  parseBrowserName,
} from '../config-values.js';
import { canonicalizeOrigin } from '../security/url-policy.js';
import type {
  NormalizedProjectConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectSecrets,
  RunType,
} from './config-types.js';
import {
  assertNoLegacyEnvironmentInputs,
  resolveProjectSecrets,
} from './project-config-environment.js';
import {
  credentials,
  normalizedSource,
  readDocument,
  safe,
  selectors,
  sourceOrigins,
} from './project-config-normalization.js';
import { assertProjectConfigDocument } from './project-config-schema.js';

export { resolveProjectSecrets } from './project-config-environment.js';

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_ARTIFACT_DIR = 'reports';

function normalizedJenkinsOrigin(
  loginUrl: string,
  configured: readonly string[] | undefined,
  fieldName: string,
  issues: string[],
): string {
  let fallback = 'https://invalid.local';
  try {
    fallback = canonicalizeOrigin(loginUrl, `${fieldName}.loginUrl`);
  } catch {
    // URL normalization catches malformed login URL errors.
  }
  const candidate = configured === undefined || configured.length === 0
    ? fallback
    : configured[0] ?? fallback;
  let origin = fallback;
  try {
    origin = canonicalizeOrigin(candidate, `${fieldName}.sourceOrigins.jenkins`);
  } catch (error) {
    if (error instanceof ConfigError && error.issues.length > 0) issues.push(...error.issues);
    else issues.push(`${fieldName}.sourceOrigins.jenkins must be a valid origin`);
  }
  return origin;
}

function normalizeDocument(
  document: ProjectConfigDocumentV1,
  env: NodeJS.ProcessEnv,
  validateSecrets = false,
): readonly NormalizedProjectConfig[] {
  const issues: string[] = [];
  const defaults: ProjectConfigDefaults = document.defaults ?? {};
  const fallbackSnyk: readonly string[] = [];
  const fallbackSonar: readonly string[] = [];
  const normalized = document.projects.map((project, index) => {
    const field = `projects[${index}]`;
    const loginUrl = safe(
      `${field}.loginUrl`,
      'http://invalid.local/login',
      () => normalizeConfiguredUrl(project.loginUrl, `${field}.loginUrl`),
      issues,
    );
    const jobUrl = safe(
      `${field}.jobUrl`,
      'http://invalid.local/job/',
      () => normalizeConfiguredUrl(project.jobUrl, `${field}.jobUrl`),
      issues,
    );
    safe(
      `${field}.jobUrl`,
      'http://invalid.local',
      () => deriveJenkinsBaseUrl(loginUrl, jobUrl),
      issues,
    );
    const timeoutMs = project.timeoutMs ?? defaults.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (
      timeoutMs < 1_000 ||
      timeoutMs > 3_600_000 ||
      !Number.isSafeInteger(timeoutMs)
    ) {
      issues.push(`${field}.timeoutMs is outside the safe range`);
    }
    const browser = safe(
      `${field}.browser`,
      'chromium',
      () => parseBrowserName(project.browser ?? defaults.browser),
      issues,
    );
    const jenkinsOrigin = normalizedJenkinsOrigin(
      loginUrl,
      project.sourceOrigins?.jenkins ?? defaults.sourceOrigins?.jenkins,
      field,
      issues,
    );
    const snykOrigins = sourceOrigins(project, defaults, 'snyk', fallbackSnyk, issues);
    const sonarOrigins = sourceOrigins(project, defaults, 'sonarqube', fallbackSonar, issues);
    const artifactDir = path.resolve(project.artifactDir ?? defaults.artifactDir ?? DEFAULT_ARTIFACT_DIR);
    const runType: RunType = project.runType ?? 'report';
    const normalizedProject: NormalizedProjectConfig = {
      schemaVersion: 1,
      id: project.id.trim(),
      name: project.name.trim(),
      runType,
      enabled: project.enabled !== false,
      loginUrl,
      jobUrl,
      timeoutMs,
      browser,
      artifactDir,
      sourceOrigins: Object.freeze({
        jenkins: jenkinsOrigin,
        snyk: Object.freeze(snykOrigins),
        sonarqube: Object.freeze(sonarOrigins),
      }),
      sources: Object.freeze({
        snyk: normalizedSource(project.snyk, snykOrigins),
        sonarqube: normalizedSource(project.sonarqube, sonarOrigins),
      }),
      selectors: selectors(project, defaults),
      credentialVariables: Object.freeze(credentials(project, defaults)),
    };
    return Object.freeze(normalizedProject);
  });
  if (validateSecrets) {
    for (const project of normalized) {
      if (!project.enabled) continue;
      try {
        resolveProjectSecrets(project, env);
      } catch (error) {
        if (error instanceof ConfigError) issues.push(...error.issues);
        else issues.push('project credentials are invalid');
      }
    }
  }
  if (issues.length > 0) throw new ConfigError(issues);
  return Object.freeze(normalized);
}

export function normalizeProjectConfigDocument(
  document: ProjectConfigDocumentV1,
  env: NodeJS.ProcessEnv = process.env,
  validateSecrets = false,
): readonly NormalizedProjectConfig[] {
  return normalizeDocument(assertProjectConfigDocument(document), env, validateSecrets);
}

export function loadProjectConfig(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
  validateSecrets = false,
): readonly NormalizedProjectConfig[] {
  assertNoLegacyEnvironmentInputs(env);
  return normalizeDocument(readDocument(filePath), env, validateSecrets);
}
