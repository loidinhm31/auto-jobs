import * as path from 'node:path';

import { ConfigError } from '../config-errors.js';
import {
  normalizeBaseUrl,
  normalizeJobPath,
  normalizeLoginPath,
  parseBrowserName,
  parsePositiveInteger,
  resolveJenkinsJobUrl,
} from '../config-values.js';
import type { BrowserName } from '../types.js';
import { canonicalizeOrigin } from '../security/url-policy.js';
import type {
  NormalizedProjectConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectSecrets,
} from './config-types.js';
import { legacyProjectConfigDocument, hasLegacyProjectInputs } from './legacy-project-config.js';
import { assertProjectConfigDocument, PROJECT_CONFIG_LIMITS } from './project-config-schema.js';
import {
  credentials,
  envValue,
  normalizedSource,
  readDocument,
  safe,
  selectors,
  sourceOrigins,
} from './project-config-normalization.js';
export type ProjectConfigLoadMode = 'file' | 'legacy';
export interface ProjectConfigLoadResult {
  readonly mode: ProjectConfigLoadMode;
  readonly projects: readonly NormalizedProjectConfig[];
  readonly diagnostics: readonly string[];
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_ARTIFACT_DIR = 'reports';

function normalizeDocument(
  document: ProjectConfigDocumentV1,
  env: NodeJS.ProcessEnv,
  validateSecrets = true,
): readonly NormalizedProjectConfig[] {
  const issues: string[] = [];
  const defaults: ProjectConfigDefaults = document.defaults ?? {};
  const fallbackSnyk: readonly string[] = [];
  const fallbackSonar: readonly string[] = [];
  const normalized = document.projects.map((project, index) => {
    const field = `projects[${index}]`;
    const baseUrl = safe(`${field}.baseUrl`, 'http://invalid.local', () => normalizeBaseUrl((project.baseUrl ?? project.jenkinsUrl) as string), issues);
    const jobPath = safe(`${field}.jobPath`, 'invalid-job', () => normalizeJobPath(project.jobPath), issues);
    const loginPath = safe(`${field}.loginPath`, '/login', () => normalizeLoginPath((project.loginPath ?? defaults.loginPath ?? '/login') as string), issues);
    const timeoutMs = safe(`${field}.timeoutMs`, DEFAULT_TIMEOUT_MS, () => parsePositiveInteger(String(project.timeoutMs ?? defaults.timeoutMs ?? DEFAULT_TIMEOUT_MS), `${field}.timeoutMs`), issues);
    const pollIntervalMs = safe(`${field}.pollIntervalMs`, DEFAULT_POLL_INTERVAL_MS, () => parsePositiveInteger(String(project.pollIntervalMs ?? defaults.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS), `${field}.pollIntervalMs`), issues);
    if (timeoutMs < PROJECT_CONFIG_LIMITS.minTimeoutMs || timeoutMs > PROJECT_CONFIG_LIMITS.maxTimeoutMs) issues.push(`${field}.timeoutMs is outside the safe range`);
    if (pollIntervalMs < PROJECT_CONFIG_LIMITS.minPollIntervalMs || pollIntervalMs > PROJECT_CONFIG_LIMITS.maxPollIntervalMs || pollIntervalMs > timeoutMs) issues.push(`${field}.pollIntervalMs is outside the safe range`);
    const browser = safe(`${field}.browser`, 'chromium' as BrowserName, () => parseBrowserName((project.browser ?? defaults.browser) as string | undefined), issues);
    const jobUrl = safe(`${field}.jobUrl`, `${baseUrl}/`, () => resolveJenkinsJobUrl(baseUrl, jobPath), issues);
    const jenkinsOrigin = safe(`${field}.baseUrl`, '', () => canonicalizeOrigin(new URL(baseUrl).origin, `${field}.origin`), issues);
    const snyk = sourceOrigins(project, defaults, 'snyk', fallbackSnyk, issues);
    const sonarqube = sourceOrigins(project, defaults, 'sonarqube', fallbackSonar, issues);
    const artifactDir = path.resolve(project.artifactDir ?? defaults.artifactDir ?? DEFAULT_ARTIFACT_DIR);
    const buildNumber = project.buildNumber;
    const normalized: NormalizedProjectConfig = {
      schemaVersion: 1, id: project.id.trim(), name: project.name.trim(), enabled: project.enabled !== false,
      baseUrl, jobPath, jobUrl, loginPath, triggerMode: (project.triggerMode ?? defaults.triggerMode ?? 'ui') as 'ui',
      timeoutMs, pollIntervalMs, browser, artifactDir,
      sourceOrigins: Object.freeze({ jenkins: jenkinsOrigin, snyk: Object.freeze(snyk), sonarqube: Object.freeze(sonarqube) }),
      sources: Object.freeze({ snyk: normalizedSource(project.snyk, baseUrl, snyk, `${field}.snyk`, issues), sonarqube: normalizedSource(project.sonarqube, baseUrl, sonarqube, `${field}.sonarqube`, issues) }),
      selectors: selectors(project, defaults),
      credentialVariables: Object.freeze(credentials(project, defaults)),
      ...(buildNumber === undefined ? {} : { buildNumber }),
    };
    return Object.freeze(normalized);
  });
  if (validateSecrets) for (const project of normalized) {
    if (!project.enabled) continue;
    try { resolveProjectSecrets(project, env); } catch (error) { if (error instanceof ConfigError) issues.push(...error.issues); else issues.push('project credentials are invalid'); }
  }
  if (issues.length > 0) throw new ConfigError(issues);
  return Object.freeze(normalized);
}

export function loadProjectConfig(filePath: string, env: NodeJS.ProcessEnv = process.env): readonly NormalizedProjectConfig[] {
  return normalizeDocument(readDocument(filePath), env);
}

export const loadProjectConfigs = loadProjectConfig;

export function parseProjectsConfig(env: NodeJS.ProcessEnv = process.env): ProjectConfigLoadResult {
  const configPath = envValue(env, 'PROJECTS_CONFIG_PATH');
  if (configPath !== undefined) {
    if (hasLegacyProjectInputs(env)) throw new ConfigError(['PROJECTS_CONFIG_PATH cannot be combined with legacy Jenkins project inputs']);
    return { mode: 'file', projects: normalizeDocument(readDocument(configPath), env, false), diagnostics: [] };
  }
  const projects = normalizeDocument(assertProjectConfigDocument(legacyProjectConfigDocument(env)), env, false);
  return { mode: 'legacy', projects, diagnostics: ['legacy single-project environment inputs are deprecated'] };
}

export function resolveProjectSecrets(
  project: Pick<NormalizedProjectConfig, 'credentialVariables'>,
  env: NodeJS.ProcessEnv = process.env,
): ProjectSecrets {
  const issues: string[] = [];
  const username = env[project.credentialVariables.usernameVariable];
  const password = env[project.credentialVariables.passwordVariable];
  if (username === undefined || username.length === 0) issues.push(`${project.credentialVariables.usernameVariable} is required`);
  if (password === undefined || password.length === 0) issues.push(`${project.credentialVariables.passwordVariable} is required`);
  if (issues.length > 0) throw new ConfigError(issues);
  return Object.freeze({ username: username as string, password: password as string });
}
