import * as path from 'node:path';

import { ConfigError } from '../config-errors.js';
import {
  deriveJenkinsBaseUrl,
  normalizeConfiguredUrl,
} from '../config-values.js';
import { DEFAULT_SELECTORS, isRecord, parseSelectorValue } from '../config-selectors.js';
import {
  canonicalizeOrigin,
  containsPathTraversal,
} from '../security/url-policy.js';
import type { ProjectConfigDocumentV1 } from './config-types.js';

export const PROJECT_CONFIG_LIMITS = {
  maxProjects: 50,
  maxStringLength: 512,
  maxNameLength: 200,
  maxOriginsPerSource: 20,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 3_600_000,
} as const;

const ROOT_KEYS: Record<string, true> = {
  schemaVersion: true,
  projects: true,
  defaults: true,
};
const PROJECT_KEYS: Record<string, true> = {
  id: true,
  name: true,
  loginUrl: true,
  jobUrl: true,
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
const DEFAULT_KEYS: Record<string, true> = {
  timeoutMs: true,
  browser: true,
  artifactDir: true,
  credentials: true,
  selectors: true,
  allowedOrigins: true,
  sourceOrigins: true,
};
const SELECTOR_KEYS: Record<string, true> = {
  authLandmark: true,
  sonarqubeReport: true,
  snykReport: true,
};
const SOURCE_KEYS: Record<string, true> = {
  allowedOrigins: true,
  projectId: true,
};
const SOURCE_ORIGIN_KEYS: Record<string, true> = {
  jenkins: true,
  snyk: true,
  sonarqube: true,
};

function addUnknownKeys(
  value: Record<string, unknown>,
  allowed: Record<string, true>,
  fieldName: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (allowed[key] !== true || ['__proto__', 'constructor', 'prototype'].includes(key)) {
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
  if (value !== undefined) stringField(value, fieldName, issues);
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
  value.forEach((origin, index) => {
    const itemField = `${fieldName}[${index}]`;
    stringField(origin, itemField, issues);
    if (typeof origin !== 'string' || origin.trim().length === 0) return;
    try {
      canonicalizeOrigin(origin, itemField);
    } catch (error) {
      if (error instanceof ConfigError && error.issues.length > 0) issues.push(...error.issues);
      else issues.push(`${itemField} must be a valid origin`);
    }
  });
}

function exactUrl(value: unknown, fieldName: string, issues: string[]): void {
  stringField(value, fieldName, issues);
  if (typeof value !== 'string' || value.trim().length === 0) return;
  try {
    normalizeConfiguredUrl(value, fieldName);
  } catch (error) {
    if (error instanceof ConfigError && error.issues.length > 0) issues.push(...error.issues);
    else issues.push(`${fieldName} must be a credential-free absolute HTTP(S) URL`);
  }
}

function safeArtifactPath(value: unknown, fieldName: string, issues: string[]): void {
  optionalString(value, fieldName, issues);
  if (typeof value !== 'string' || value.trim().length === 0) return;
  const trimmed = value.trim();
  if (containsPathTraversal(trimmed)) {
    issues.push(`${fieldName} must not contain traversal segments`);
    return;
  }
  if (path.resolve(trimmed) === path.parse(path.resolve(trimmed)).root) {
    issues.push(`${fieldName} must not be the filesystem root`);
  }
}

function credentials(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must contain environment variable names`);
    return;
  }
  addUnknownKeys(value, {
    usernameVariable: true,
    passwordVariable: true,
  }, fieldName, issues);
  if ('username' in value || 'password' in value) {
    issues.push(`${fieldName} must not contain credential values`);
  }
  variableName(value.usernameVariable, `${fieldName}.usernameVariable`, issues);
  variableName(value.passwordVariable, `${fieldName}.passwordVariable`, issues);
}

function selectors(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, SELECTOR_KEYS, fieldName, issues);
  for (const [key, selector] of Object.entries(value)) {
    if (SELECTOR_KEYS[key] !== true) continue;
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
  if ('projectId' in value) optionalString(value.projectId, `${fieldName}.projectId`, issues);
}

function sourceOriginPolicies(value: unknown, fieldName: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }
  addUnknownKeys(value, SOURCE_ORIGIN_KEYS, fieldName, issues);
  for (const source of Object.keys(SOURCE_ORIGIN_KEYS)) {
    if (value[source] !== undefined) originList(value[source], `${fieldName}.${source}`, issues);
  }
}

function commonOptions(value: Record<string, unknown>, fieldName: string, issues: string[]): void {
  if (value.timeoutMs !== undefined) {
    boundedNumber(
      value.timeoutMs,
      `${fieldName}.timeoutMs`,
      PROJECT_CONFIG_LIMITS.minTimeoutMs,
      PROJECT_CONFIG_LIMITS.maxTimeoutMs,
      issues,
    );
  }
  if (value.browser !== undefined && !['chromium', 'firefox', 'webkit'].includes(String(value.browser))) {
    issues.push(`${fieldName}.browser is invalid`);
  }
  if (value.artifactDir !== undefined) safeArtifactPath(value.artifactDir, `${fieldName}.artifactDir`, issues);
  if (value.credentials !== undefined) credentials(value.credentials, `${fieldName}.credentials`, issues);
  if (value.selectors !== undefined) selectors(value.selectors, `${fieldName}.selectors`, issues);
  if (value.allowedOrigins !== undefined) originList(value.allowedOrigins, `${fieldName}.allowedOrigins`, issues);
  if (value.sourceOrigins !== undefined) sourceOriginPolicies(value.sourceOrigins, `${fieldName}.sourceOrigins`, issues);
}

function project(value: unknown, index: number, issues: string[]): void {
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
  if (
    typeof value.loginUrl === 'string' &&
    typeof value.jobUrl === 'string' &&
    value.loginUrl.trim().length > 0 &&
    value.jobUrl.trim().length > 0
  ) {
    try {
      deriveJenkinsBaseUrl(value.loginUrl, value.jobUrl);
    } catch (error) {
      if (error instanceof ConfigError && error.issues.length > 0) issues.push(...error.issues);
      else issues.push(`${fieldName}.jobUrl must share the Jenkins login context`);
    }
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    issues.push(`${fieldName}.enabled must be boolean`);
  }
  if (value.snyk !== undefined) sources(value.snyk, `${fieldName}.snyk`, issues);
  if (value.sonarqube !== undefined) sources(value.sonarqube, `${fieldName}.sonarqube`, issues);
  commonOptions(value, fieldName, issues);
}

export function assertProjectConfigDocument(value: unknown): ProjectConfigDocumentV1 {
  const issues: string[] = [];
  if (!isRecord(value)) throw new ConfigError(['project config must be an object']);
  addUnknownKeys(value, ROOT_KEYS, 'config', issues);
  if (value.schemaVersion !== 1) issues.push('config.schemaVersion must be 1');
  if (
    !Array.isArray(value.projects) ||
    value.projects.length === 0 ||
    value.projects.length > PROJECT_CONFIG_LIMITS.maxProjects
  ) {
    issues.push('config.projects must contain 1 to 50 projects');
  }
  if (Array.isArray(value.projects)) value.projects.forEach((item, index) => project(item, index, issues));
  if (isRecord(value.defaults)) {
    addUnknownKeys(value.defaults, DEFAULT_KEYS, 'config.defaults', issues);
    commonOptions(value.defaults, 'config.defaults', issues);
  } else if (value.defaults !== undefined) {
    issues.push('config.defaults must be an object');
  }
  const ids = new Set<string>();
  if (Array.isArray(value.projects)) {
    for (const item of value.projects) {
      if (isRecord(item) && typeof item.id === 'string') {
        if (ids.has(item.id)) issues.push(`duplicate project id: ${item.id}`);
        ids.add(item.id);
      }
    }
  }
  if (
    Array.isArray(value.projects) &&
    !value.projects.some((item) => isRecord(item) && item.enabled !== false)
  ) {
    issues.push('config.projects must contain an enabled project');
  }
  if (issues.length > 0) throw new ConfigError(issues);
  return value as unknown as ProjectConfigDocumentV1;
}
