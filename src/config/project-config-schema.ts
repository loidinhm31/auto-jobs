import { ConfigError } from '../config-errors.js';
import { DEFAULT_SELECTORS, isRecord, parseSelectorValue } from '../config-selectors.js';
import type {
  ProjectConfigDocumentV1,
} from './config-types.js';
export const PROJECT_CONFIG_LIMITS = {
  maxProjects: 50,
  maxStringLength: 512,
  maxNameLength: 200,
  maxOriginsPerSource: 20,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 3_600_000,
  minPollIntervalMs: 50,
  maxPollIntervalMs: 60_000,
  maxBuildNumber: 2_147_483_647,
} as const;
const ROOT_KEYS = new Set(['schemaVersion', 'projects', 'defaults']);
const PROJECT_KEYS = new Set([
  'id', 'name', 'enabled', 'baseUrl', 'jenkinsUrl', 'jobPath', 'buildNumber',
  'loginPath', 'triggerMode', 'timeoutMs', 'pollIntervalMs', 'browser',
  'artifactDir', 'credentials', 'credentialVariables', 'selectors',
  'allowedOrigins', 'sourceOrigins', 'snyk', 'sonarqube',
]);
const DEFAULT_KEYS = new Set([
  'loginPath', 'triggerMode', 'timeoutMs', 'pollIntervalMs', 'browser',
  'artifactDir', 'credentials', 'credentialVariables', 'selectors',
  'allowedOrigins', 'sourceOrigins',
]);
const SELECTOR_KEYS = new Set([
  'trigger', 'authLandmark', 'queueUrl', 'buildStatus', 'buildUrl',
  'sonarqubeReport', 'snykReport',
]);
const SOURCE_KEYS = new Set(['allowedOrigins', 'reportPath', 'homeUrl']);
function addUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  fieldName: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      issues.push(`${fieldName}.${key} is not supported`);
    }
  }
}
function stringField(
  value: unknown,
  fieldName: string,
  issues: string[],
  maxLength: number = PROJECT_CONFIG_LIMITS.maxStringLength,
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${fieldName} must be a non-empty string`);
  } else if (value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    issues.push(`${fieldName} exceeds the safe string limit`);
  }
}
function variableName(value: unknown, fieldName: string, issues: string[]): void {
  stringField(value, fieldName, issues, 128);
  if (typeof value === 'string' && !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(value.trim())) {
    issues.push(`${fieldName} must be an environment variable name`);
  }
}
function optionalString(
  value: unknown,
  fieldName: string,
  issues: string[],
): void {
  if (value !== undefined) {
    stringField(value, fieldName, issues);
  }
}
function boundedNumber(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
  issues: string[],
): void {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    issues.push(`${fieldName} must be an integer from ${minimum} to ${maximum}`);
  }
}
function originList(value: unknown, fieldName: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length > PROJECT_CONFIG_LIMITS.maxOriginsPerSource) {
    issues.push(`${fieldName} must be a bounded array of origins`);
    return;
  }
  value.forEach((origin, index) => stringField(origin, `${fieldName}[${index}]`, issues));
}
function credentials(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must contain variable names`);
    return;
  }
  addUnknownKeys(value, new Set(['usernameVariable', 'passwordVariable', 'username', 'password']), fieldName, issues);
  if ('username' in value || 'password' in value) {
    issues.push(`${fieldName} must not contain credential values`);
  }
  variableName(value.usernameVariable, `${fieldName}.usernameVariable`, issues);
  variableName(value.passwordVariable, `${fieldName}.passwordVariable`, issues);
}
function credentialVariables(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must contain environment variable names`);
    return;
  }
  addUnknownKeys(value, new Set(['username', 'password']), fieldName, issues);
  variableName(value.username, `${fieldName}.username`, issues);
  variableName(value.password, `${fieldName}.password`, issues);
}
function selectors(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, SELECTOR_KEYS, fieldName, issues);
  for (const [key, selector] of Object.entries(value)) {
    if (!SELECTOR_KEYS.has(key)) continue;
    try {
      const defaultRequired = DEFAULT_SELECTORS[key as keyof typeof DEFAULT_SELECTORS]?.required ?? true;
      parseSelectorValue(selector, `${fieldName}.${key}`, defaultRequired);
    } catch {
      issues.push(`${fieldName}.${key} must be a valid selector`);
    }
  }
}
function sources(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, SOURCE_KEYS, fieldName, issues);
  if ('allowedOrigins' in value) originList(value.allowedOrigins, `${fieldName}.allowedOrigins`, issues);
  optionalString(value.reportPath, `${fieldName}.reportPath`, issues);
  optionalString(value.homeUrl, `${fieldName}.homeUrl`, issues);
}
function commonOptions(value: Record<string, unknown>, fieldName: string, issues: string[]): void {
  optionalString(value.loginPath, `${fieldName}.loginPath`, issues);
  optionalString(value.artifactDir, `${fieldName}.artifactDir`, issues);
  if (value.triggerMode !== undefined && value.triggerMode !== 'ui') issues.push(`${fieldName}.triggerMode must be ui`);
  if (value.timeoutMs !== undefined) boundedNumber(value.timeoutMs, `${fieldName}.timeoutMs`, PROJECT_CONFIG_LIMITS.minTimeoutMs, PROJECT_CONFIG_LIMITS.maxTimeoutMs, issues);
  if (value.pollIntervalMs !== undefined) boundedNumber(value.pollIntervalMs, `${fieldName}.pollIntervalMs`, PROJECT_CONFIG_LIMITS.minPollIntervalMs, PROJECT_CONFIG_LIMITS.maxPollIntervalMs, issues);
  if (value.timeoutMs !== undefined && value.pollIntervalMs !== undefined && typeof value.timeoutMs === 'number' && typeof value.pollIntervalMs === 'number' && value.pollIntervalMs > value.timeoutMs) issues.push(`${fieldName}.pollIntervalMs must not exceed timeoutMs`);
  if (value.browser !== undefined && !['chromium', 'firefox', 'webkit'].includes(String(value.browser))) issues.push(`${fieldName}.browser is invalid`);
  if (value.artifactDir !== undefined && String(value.artifactDir).includes('\u0000')) issues.push(`${fieldName}.artifactDir is invalid`);
  if (value.credentials !== undefined) credentials(value.credentials, `${fieldName}.credentials`, issues);
  if (value.credentialVariables !== undefined) credentialVariables(value.credentialVariables, `${fieldName}.credentialVariables`, issues);
  if (value.credentials !== undefined && value.credentialVariables !== undefined) issues.push(`${fieldName} cannot define both credential reference shapes`);
  if (value.selectors !== undefined) selectors(value.selectors, `${fieldName}.selectors`, issues);
  if (value.allowedOrigins !== undefined) originList(value.allowedOrigins, `${fieldName}.allowedOrigins`, issues);
  if (value.sourceOrigins !== undefined) {
    if (!isRecord(value.sourceOrigins)) issues.push(`${fieldName}.sourceOrigins must be an object`);
    else {
      addUnknownKeys(value.sourceOrigins, new Set(['snyk', 'sonarqube']), `${fieldName}.sourceOrigins`, issues);
      for (const source of ['snyk', 'sonarqube'] as const) if (value.sourceOrigins[source] !== undefined) originList(value.sourceOrigins[source], `${fieldName}.sourceOrigins.${source}`, issues);
    }
  }
}
function project(value: unknown, index: number, issues: string[]): void {
  const fieldName = `projects[${index}]`;
  if (!isRecord(value)) { issues.push(`${fieldName} must be an object`); return; }
  addUnknownKeys(value, PROJECT_KEYS, fieldName, issues);
  stringField(value.id, `${fieldName}.id`, issues, 63);
  if (typeof value.id === 'string' && !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(value.id)) issues.push(`${fieldName}.id must use lowercase safe characters`);
  stringField(value.name, `${fieldName}.name`, issues, PROJECT_CONFIG_LIMITS.maxNameLength);
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') issues.push(`${fieldName}.enabled must be boolean`);
  const baseUrl = value.baseUrl ?? value.jenkinsUrl;
  if (value.baseUrl !== undefined && value.jenkinsUrl !== undefined) issues.push(`${fieldName} must define only one Jenkins base URL`);
  stringField(baseUrl, `${fieldName}.baseUrl`, issues);
  stringField(value.jobPath, `${fieldName}.jobPath`, issues);
  if (value.buildNumber !== undefined) boundedNumber(value.buildNumber, `${fieldName}.buildNumber`, 1, PROJECT_CONFIG_LIMITS.maxBuildNumber, issues);
  if (value.snyk !== undefined) sources(value.snyk, `${fieldName}.snyk`, issues);
  if (value.sonarqube !== undefined) sources(value.sonarqube, `${fieldName}.sonarqube`, issues);
  commonOptions(value, fieldName, issues);
}
export function assertProjectConfigDocument(value: unknown): ProjectConfigDocumentV1 {
  const issues: string[] = [];
  if (!isRecord(value)) throw new ConfigError(['project config must be an object']);
  addUnknownKeys(value, ROOT_KEYS, 'config', issues);
  if (value.schemaVersion !== 1) issues.push('config.schemaVersion must be 1');
  if (!Array.isArray(value.projects) || value.projects.length === 0 || value.projects.length > PROJECT_CONFIG_LIMITS.maxProjects) issues.push('config.projects must contain 1 to 50 projects');
  if (Array.isArray(value.projects)) value.projects.forEach((item, index) => project(item, index, issues));
  if (isRecord(value.defaults)) { addUnknownKeys(value.defaults, DEFAULT_KEYS, 'config.defaults', issues); commonOptions(value.defaults, 'config.defaults', issues); }
  else if (value.defaults !== undefined) issues.push('config.defaults must be an object');
  const ids = new Set<string>();
  if (Array.isArray(value.projects)) for (const item of value.projects) if (isRecord(item) && typeof item.id === 'string') { if (ids.has(item.id)) issues.push(`duplicate project id: ${item.id}`); ids.add(item.id); }
  if (Array.isArray(value.projects) && !value.projects.some((item) => isRecord(item) && item.enabled !== false)) issues.push('config.projects must contain an enabled project');
  if (issues.length > 0) throw new ConfigError(issues);
  return value as unknown as ProjectConfigDocumentV1;
}
