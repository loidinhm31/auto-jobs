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
} from './config-types.js';
import {
  credentials,
  normalizedSource,
  readDocument,
  safe,
  selectors,
  sourceOrigins,
} from './project-config-normalization.js';
import { assertProjectConfigDocument } from './project-config-schema.js';

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_ARTIFACT_DIR = 'reports';

const LEGACY_STRUCTURE_ENVIRONMENT_KEYS: Record<string, true> = {
  REPORT_SOURCE: true,
  PROJECTS_CONFIG_PATH: true,
  JENKINS_BASE_URL: true,
  JENKINS_JOB_PATH: true,
  JENKINS_BUILD_NUMBER: true,
  JENKINS_LOGIN_PATH: true,
  JENKINS_TRIGGER_MODE: true,
  JENKINS_TIMEOUT_MS: true,
  JENKINS_POLL_INTERVAL_MS: true,
  PLAYWRIGHT_BROWSER: true,
  ARTIFACT_DIR: true,
  PROJECT_ID: true,
  PROJECT_NAME: true,
  JENKINS_USERNAME_VARIABLE: true,
  JENKINS_PASSWORD_VARIABLE: true,
  JENKINS_TRIGGER_SELECTOR: true,
  JENKINS_AUTH_LANDMARK: true,
  JENKINS_QUEUE_URL_SELECTOR: true,
  JENKINS_BUILD_STATUS_SELECTOR: true,
  JENKINS_BUILD_URL_SELECTOR: true,
  SONAR_REPORT_SELECTOR: true,
  SNYK_REPORT_SELECTOR: true,
  SNYK_ALLOWED_ORIGINS: true,
  SNYK_PROJECT_ID: true,
  SONARQUBE_ALLOWED_ORIGINS: true,
  SONARQUBE_PROJECT_ID: true,
};

function assertNoLegacyEnvironmentInputs(env: NodeJS.ProcessEnv): void {
  if (Object.keys(LEGACY_STRUCTURE_ENVIRONMENT_KEYS).some((key) => env[key]?.trim())) {
    throw new ConfigError(['legacy environment configuration is not supported; use --config <path>']);
  }
}

function normalizedJenkinsOrigin(
  loginUrl: string,
  configured: readonly string[] | undefined,
  fieldName: string,
  issues: string[],
): string {
  const origin = safe(
    `${fieldName}.loginUrl`,
    '',
    () => canonicalizeOrigin(new URL(loginUrl).origin, `${fieldName}.jenkins origin`),
    issues,
  );
  if (configured !== undefined) {
    const allowed = configured
      .map((value, index) => safe(
        `${fieldName}.sourceOrigins.jenkins[${index}]`,
        '',
        () => canonicalizeOrigin(value, `${fieldName}.sourceOrigins.jenkins`),
        issues,
      ))
      .filter(Boolean);
    if (!allowed.includes(origin)) {
      issues.push(`${fieldName}.sourceOrigins.jenkins must include the configured Jenkins origin`);
    }
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
    const baseUrl = safe(
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
    const normalized: NormalizedProjectConfig = {
      schemaVersion: 1,
      id: project.id.trim(),
      name: project.name.trim(),
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
    return Object.freeze(normalized);
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

export function resolveProjectSecrets(
  project: Pick<NormalizedProjectConfig, 'credentialVariables'>,
  env: NodeJS.ProcessEnv = process.env,
): ProjectSecrets {
  const issues: string[] = [];
  const username = env[project.credentialVariables.usernameVariable];
  const password = env[project.credentialVariables.passwordVariable];
  if (username === undefined || username.length === 0) {
    issues.push(`${project.credentialVariables.usernameVariable} is required`);
  }
  if (password === undefined || password.length === 0) {
    issues.push(`${project.credentialVariables.passwordVariable} is required`);
  }
  if (issues.length > 0) throw new ConfigError(issues);
  return Object.freeze({ username: username as string, password: password as string });
}
