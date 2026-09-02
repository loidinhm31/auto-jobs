import { ConfigError } from '../config-errors.js';
import { deriveJenkinsBaseUrl } from '../config-values.js';
import { DEFAULT_SELECTORS, isRecord, parseSelectorValue } from '../config-selectors.js';
import {
  PROJECT_CONFIG_LIMITS,
  addUnknownKeys,
  boundedNumber,
  exactUrl,
  optionalString,
  originList,
  safeArtifactPath,
  stringField,
  variableName,
} from './project-config-field-validation.js';

export const ROOT_KEYS: Record<string, true> = {
  schemaVersion: true,
  projects: true,
  defaults: true,
};

export const PROJECT_KEYS: Record<string, true> = {
  id: true,
  name: true,
  loginUrl: true,
  jobUrl: true,
  runType: true,
  enabled: true,
  timeoutMs: true,
  browser: true,
  artifactDir: true,
  credentials: true,
  selectors: true,
  allowedOrigins: true,
  sourceOrigins: true,
  snyk: true,
  sonarqube: true,
};

export const DEFAULT_KEYS: Record<string, true> = {
  timeoutMs: true,
  browser: true,
  artifactDir: true,
  credentials: true,
  selectors: true,
  allowedOrigins: true,
  sourceOrigins: true,
};

export const SELECTOR_KEYS: Record<string, true> = {
  authLandmark: true,
  sonarqubeReport: true,
  snykReport: true,
  buildParametersLink: true,
  buildSubmitButton: true,
};

export const SOURCE_KEYS: Record<string, true> = {
  allowedOrigins: true,
  projectId: true,
};

export const SOURCE_ORIGIN_KEYS: Record<string, true> = {
  jenkins: true,
  snyk: true,
  sonarqube: true,
};

export function validateRunType(value: unknown, fieldName: string, issues: string[]): void {
  if (value !== undefined && (typeof value !== 'string' || (value !== 'report' && value !== 'auto-build'))) {
    issues.push(`${fieldName} must be 'report' or 'auto-build'`);
  }
}

export function validateCredentials(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must contain environment variable names`);
    return;
  }
  addUnknownKeys(value, { usernameVariable: true, passwordVariable: true }, fieldName, issues);
  if ('username' in value || 'password' in value) issues.push(`${fieldName} must not contain credential values`);
  variableName(value.usernameVariable, `${fieldName}.usernameVariable`, issues);
  variableName(value.passwordVariable, `${fieldName}.passwordVariable`, issues);
}

export function validateSelectors(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, SELECTOR_KEYS, fieldName, issues);
  for (const [key, selector] of Object.entries(value)) {
    if (SELECTOR_KEYS[key] !== true) continue;
    try {
      const defaultRequired = DEFAULT_SELECTORS[key as keyof typeof DEFAULT_SELECTORS]?.required ?? true;
      const parsedSelector = parseSelectorValue(selector, `${fieldName}.${key}`, defaultRequired);
      if (key === 'authLandmark' && !parsedSelector.required) {
        issues.push(`${fieldName}.authLandmark must be required for authenticated Jenkins navigation`);
      } else if (key === 'buildParametersLink' && !parsedSelector.required) {
        issues.push(`${fieldName}.buildParametersLink must be required for Jenkins auto-build navigation`);
      } else if (key === 'buildSubmitButton' && !parsedSelector.required) {
        issues.push(`${fieldName}.buildSubmitButton must be required for Jenkins build submission`);
      }
    } catch {
      issues.push(`${fieldName}.${key} must be a valid selector`);
    }
  }
}

export function validateSources(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, SOURCE_KEYS, fieldName, issues);
  if ('allowedOrigins' in value) originList(value.allowedOrigins, `${fieldName}.allowedOrigins`, issues);
  if ('projectId' in value) optionalString(value.projectId, `${fieldName}.projectId`, issues);
}

export function validateSourceOriginPolicies(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, SOURCE_ORIGIN_KEYS, fieldName, issues);
  for (const source of Object.keys(SOURCE_ORIGIN_KEYS)) {
    if (value[source] !== undefined) originList(value[source], `${fieldName}.${source}`, issues);
  }
}

export function validateCommonOptions(value: Record<string, unknown>, fieldName: string, issues: string[]): void {
  if (value.timeoutMs !== undefined) {
    boundedNumber(value.timeoutMs, `${fieldName}.timeoutMs`, PROJECT_CONFIG_LIMITS.minTimeoutMs, PROJECT_CONFIG_LIMITS.maxTimeoutMs, issues);
  }
  if (value.browser !== undefined && !['chromium', 'firefox', 'webkit'].includes(String(value.browser))) {
    issues.push(`${fieldName}.browser is invalid`);
  }
  if (value.artifactDir !== undefined) safeArtifactPath(value.artifactDir, `${fieldName}.artifactDir`, issues);
  if (value.credentials !== undefined) validateCredentials(value.credentials, `${fieldName}.credentials`, issues);
  if (value.selectors !== undefined) validateSelectors(value.selectors, `${fieldName}.selectors`, issues);
  if (value.allowedOrigins !== undefined) originList(value.allowedOrigins, `${fieldName}.allowedOrigins`, issues);
  if (value.sourceOrigins !== undefined) validateSourceOriginPolicies(value.sourceOrigins, `${fieldName}.sourceOrigins`, issues);
}

export function validateProject(value: unknown, index: number, issues: string[]): void {
  const fieldName = `projects[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, PROJECT_KEYS, fieldName, issues);
  stringField(value.id, `${fieldName}.id`, issues, 63);
  if (typeof value.id === 'string' && !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(value.id)) {
    issues.push(`${fieldName}.id must use lowercase safe characters`);
  }
  stringField(value.name, `${fieldName}.name`, issues, PROJECT_CONFIG_LIMITS.maxNameLength);
  exactUrl(value.loginUrl, `${fieldName}.loginUrl`, issues);
  exactUrl(value.jobUrl, `${fieldName}.jobUrl`, issues);
  if (typeof value.loginUrl === 'string' && typeof value.jobUrl === 'string' && value.loginUrl.trim().length > 0 && value.jobUrl.trim().length > 0) {
    try {
      deriveJenkinsBaseUrl(value.loginUrl, value.jobUrl);
    } catch (error) {
      if (error instanceof ConfigError && error.issues.length > 0) issues.push(...error.issues);
      else issues.push(`${fieldName}.jobUrl must share the Jenkins login context`);
    }
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') issues.push(`${fieldName}.enabled must be boolean`);
  validateRunType(value.runType, `${fieldName}.runType`, issues);
  if (value.snyk !== undefined) validateSources(value.snyk, `${fieldName}.snyk`, issues);
  if (value.sonarqube !== undefined) validateSources(value.sonarqube, `${fieldName}.sonarqube`, issues);
  validateCommonOptions(value, fieldName, issues);
}

export function validateDefaults(value: unknown, issues: string[]): void {
  if (isRecord(value)) {
    addUnknownKeys(value, DEFAULT_KEYS, 'config.defaults', issues);
    validateCommonOptions(value, 'config.defaults', issues);
  } else if (value !== undefined) {
    issues.push('config.defaults must be an object');
  }
}
