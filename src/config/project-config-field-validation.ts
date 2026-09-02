import * as path from 'node:path';

import { ConfigError } from '../config-errors.js';
import { normalizeConfiguredUrl } from '../config-values.js';
import {
  canonicalizeOrigin,
  containsPathTraversal,
} from '../security/url-policy.js';

export const PROJECT_CONFIG_LIMITS = {
  maxProjects: 50,
  maxStringLength: 512,
  maxNameLength: 200,
  maxOriginsPerSource: 20,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 3_600_000,
} as const;

export function addUnknownKeys(
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

export function stringField(
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

export function variableName(value: unknown, fieldName: string, issues: string[]): void {
  stringField(value, fieldName, issues, 128);
  if (typeof value === 'string' && !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(value.trim())) {
    issues.push(`${fieldName} must be an environment variable name`);
  }
}

export function optionalString(
  value: unknown,
  fieldName: string,
  issues: string[],
): void {
  if (value !== undefined) stringField(value, fieldName, issues);
}

export function boundedNumber(
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

export function originList(value: unknown, fieldName: string, issues: string[]): void {
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

export function exactUrl(value: unknown, fieldName: string, issues: string[]): void {
  stringField(value, fieldName, issues);
  if (typeof value !== 'string' || value.trim().length === 0) return;
  try {
    const normalized = normalizeConfiguredUrl(value, fieldName);
    if (new URL(normalized).search !== '') issues.push(`${fieldName} must not contain a query`);
  } catch (error) {
    if (error instanceof ConfigError && error.issues.length > 0) issues.push(...error.issues);
    else issues.push(`${fieldName} must be a credential-free absolute HTTP(S) URL`);
  }
}

export function safeArtifactPath(value: unknown, fieldName: string, issues: string[]): void {
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
