import * as fs from 'node:fs';
import * as path from 'node:path';

import { ConfigError } from '../config-errors.js';
import { DEFAULT_SELECTORS, parseSelectorValue } from '../config-selectors.js';
import {
  canonicalizeOrigin,
  containsPathTraversal,
} from '../security/url-policy.js';
import type { LocatorSelector, SelectorConfig, SelectorOverrides, SourceName } from '../types.js';
import type {
  NormalizedSourceConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectCredentialReferences,
  ProjectSourceInput,
} from './config-types.js';
import { assertProjectConfigDocument } from './project-config-schema.js';

export function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function safe<T>(field: string, fallback: T, fn: () => T, issues: string[]): T {
  try {
    return fn();
  } catch {
    issues.push(`${field} is invalid`);
    return fallback;
  }
}

function hasSymlinkComponent(absolute: string): boolean {
  const root = path.parse(absolute).root;
  let current = absolute;
  while (current !== root) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return true;
    } catch {
      // Missing components are checked by the final file read.
    }
    current = path.dirname(current);
  }
  return false;
}

export function readDocument(filePath: string): ProjectConfigDocumentV1 {
  let absolute: string;
  try {
    if (filePath.trim().length === 0 || containsPathTraversal(filePath)) {
      throw new Error('unsafe path');
    }
    absolute = path.resolve(filePath);
  } catch {
    throw new ConfigError(['config path is invalid']);
  }
  if (hasSymlinkComponent(absolute)) {
    throw new ConfigError(['config path must not contain symbolic links']);
  }
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    throw new ConfigError(['config file could not be read']);
  }
  if (!stat.isFile() || stat.size > 1_048_576) {
    throw new ConfigError(['config file must be a regular JSON file under 1 MiB']);
  }
  let text: string;
  try {
    text = fs.readFileSync(absolute, 'utf8');
  } catch {
    throw new ConfigError(['config file could not be read']);
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ConfigError(['config file must contain valid JSON']);
  }
  return assertProjectConfigDocument(value);
}

export function sourceOrigins(
  project: ProjectConfigInput,
  defaults: ProjectConfigDefaults,
  source: SourceName,
  fallback: readonly string[],
  issues: string[],
): string[] {
  const projectOrigins = project.sourceOrigins?.[source];
  const sourceInput = project[source] as ProjectSourceInput | undefined;
  const defaultOrigins = defaults.sourceOrigins?.[source];
  const configured = sourceInput?.allowedOrigins ??
    projectOrigins ??
    defaultOrigins ??
    project.allowedOrigins ??
    defaults.allowedOrigins ??
    fallback;
  return configured
    .map((origin, index) => safe(
      `${source} origin ${index + 1}`,
      '',
      () => canonicalizeOrigin(origin, `${source} origin`),
      issues,
    ))
    .filter(Boolean);
}

export function credentials(
  project: ProjectConfigInput,
  defaults: ProjectConfigDefaults,
): ProjectCredentialReferences {
  const references = project.credentials ?? defaults.credentials;
  return references === undefined
    ? { usernameVariable: 'JENKINS_USERNAME', passwordVariable: 'JENKINS_PASSWORD' }
    : {
      usernameVariable: references.usernameVariable.trim(),
      passwordVariable: references.passwordVariable.trim(),
    };
}

function cloneSelector(value: LocatorSelector): LocatorSelector {
  return {
    kind: value.kind,
    value: value.value,
    required: value.required,
    ...(value.name === undefined ? {} : { name: value.name }),
  };
}

export function selectors(
  project: ProjectConfigInput,
  defaults: ProjectConfigDefaults,
): SelectorConfig {
  const overrides: SelectorOverrides = {
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

export function normalizedSource(
  input: ProjectSourceInput | undefined,
  origins: readonly string[],
): NormalizedSourceConfig {
  return Object.freeze({
    allowedOrigins: Object.freeze([...origins]),
    ...(input?.projectId === undefined ? {} : { projectId: input.projectId.trim() }),
  });
}
