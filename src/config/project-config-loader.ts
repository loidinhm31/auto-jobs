import * as fs from 'node:fs';
import * as path from 'node:path';

import { ConfigError } from '../config-errors.js';
import { DEFAULT_SELECTORS, parseSelectorValue } from '../config-selectors.js';
import {
  normalizeBaseUrl,
  normalizeJobPath,
  normalizeLoginPath,
  parseBrowserName,
  parsePositiveInteger,
  resolveJenkinsJobUrl,
} from '../config-values.js';
import {
  assertAllowedUrl,
  canonicalizeOrigin,
  resolveSafeRelativeUrl,
} from '../security/url-policy.js';
import type {
  BrowserName,
  LocatorSelector,
  SelectorConfig,
  SelectorOverrides,
  SourceName,
} from '../types.js';
import type {
  NormalizedProjectConfig,
  NormalizedSourceConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectCredentialReferences,
  ProjectSecrets,
  ProjectSourceInput,
} from './config-types.js';
import { legacyProjectConfigDocument, hasLegacyProjectInputs } from './legacy-project-config.js';
import { assertProjectConfigDocument, PROJECT_CONFIG_LIMITS } from './project-config-schema.js';
export type ProjectConfigLoadMode = 'file' | 'legacy';
export interface ProjectConfigLoadResult {
  readonly mode: ProjectConfigLoadMode;
  readonly projects: readonly NormalizedProjectConfig[];
  readonly diagnostics: readonly string[];
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_ARTIFACT_DIR = 'reports';
function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}
function safe<T>(field: string, fallback: T, fn: () => T, issues: string[]): T {
  try { return fn(); } catch { issues.push(`${field} is invalid`); return fallback; }
}
function readDocument(filePath: string): ProjectConfigDocumentV1 {
  const absolute = path.resolve(filePath);
  let stat: fs.Stats;
  try { stat = fs.statSync(absolute); } catch { throw new ConfigError(['PROJECTS_CONFIG_PATH could not be read']); }
  if (!stat.isFile() || stat.size > 1_048_576) throw new ConfigError(['PROJECTS_CONFIG_PATH must be a regular JSON file under 1 MiB']);
  let text: string;
  try { text = fs.readFileSync(absolute, 'utf8'); } catch { throw new ConfigError(['PROJECTS_CONFIG_PATH could not be read']); }
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new ConfigError(['PROJECTS_CONFIG_PATH must contain valid JSON']); }
  return assertProjectConfigDocument(value);
}
function sourceOrigins(
  project: ProjectConfigInput,
  defaults: ProjectConfigDefaults,
  source: SourceName,
  fallback: readonly string[],
  issues: string[],
): string[] {
  const projectOrigins = project.sourceOrigins?.[source];
  const sourceInput = project[source] as ProjectSourceInput | undefined;
  const defaultOrigins = defaults.sourceOrigins?.[source];
  const configured = sourceInput?.allowedOrigins ?? projectOrigins ?? defaultOrigins ?? project.allowedOrigins ?? defaults.allowedOrigins ?? fallback;
  return configured.map((origin, index) => safe(`${source} origin ${index + 1}`, '', () => canonicalizeOrigin(origin, `${source} origin`), issues)).filter(Boolean);
}
function credentials(
  project: ProjectConfigInput,
  defaults: ProjectConfigDefaults,
): ProjectCredentialReferences {
  if (project.credentials !== undefined) {
    return {
      usernameVariable: project.credentials.usernameVariable.trim(),
      passwordVariable: project.credentials.passwordVariable.trim(),
    };
  }
  if (project.credentialVariables !== undefined) {
    return {
      usernameVariable: project.credentialVariables.username.trim(),
      passwordVariable: project.credentialVariables.password.trim(),
    };
  }
  if (defaults.credentials !== undefined) {
    return {
      usernameVariable: defaults.credentials.usernameVariable.trim(),
      passwordVariable: defaults.credentials.passwordVariable.trim(),
    };
  }
  if (defaults.credentialVariables !== undefined) {
    return {
      usernameVariable: defaults.credentialVariables.username.trim(),
      passwordVariable: defaults.credentialVariables.password.trim(),
    };
  }
  return { usernameVariable: 'JENKINS_USERNAME', passwordVariable: 'JENKINS_PASSWORD' };
}
function cloneSelector(value: LocatorSelector): LocatorSelector {
  return { kind: value.kind, value: value.value, required: value.required, ...(value.name === undefined ? {} : { name: value.name }) };
}
function selectors(project: ProjectConfigInput, defaults: ProjectConfigDefaults): SelectorConfig {
  const overrides = {
    ...((defaults.selectors as SelectorOverrides | undefined) ?? {}),
    ...(project.selectors ?? {}),
  };
  const result = {} as SelectorConfig;
  for (const key of Object.keys(DEFAULT_SELECTORS) as (keyof SelectorConfig)[]) {
    const override = overrides[key];
    const selector = override === undefined
      ? DEFAULT_SELECTORS[key]
      : parseSelectorValue(override, `selectors.${key}`, DEFAULT_SELECTORS[key].required);
    result[key] = Object.freeze(cloneSelector(selector));
  }
  return Object.freeze(result);
}
function normalizedSource(
  input: ProjectSourceInput | undefined,
  baseUrl: string,
  origins: readonly string[],
  fieldName: string,
  issues: string[],
): NormalizedSourceConfig {
  let reportPath: string | undefined;
  let homeUrl: string | undefined;
  if (input?.reportPath !== undefined) {
    safe(fieldName, undefined, () => resolveSafeRelativeUrl(baseUrl, input.reportPath as string, fieldName), issues);
    reportPath = input.reportPath.trim();
  }
  if (input?.homeUrl !== undefined) {
    homeUrl = safe(fieldName, undefined, () => assertAllowedUrl(input.homeUrl as string, baseUrl, origins, fieldName), issues);
  }
  return Object.freeze({
    allowedOrigins: Object.freeze([...origins]),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(homeUrl === undefined ? {} : { homeUrl }),
  });
}

function normalizeDocument(
  document: ProjectConfigDocumentV1,
  env: NodeJS.ProcessEnv,
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
  for (const project of normalized) {
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
    return { mode: 'file', projects: loadProjectConfig(configPath, env), diagnostics: [] };
  }
  const projects = normalizeDocument(assertProjectConfigDocument(legacyProjectConfigDocument(env)), env);
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
