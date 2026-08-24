import * as fs from 'node:fs';
import * as path from 'node:path';

import { ConfigError } from '../config-errors.js';
import { DEFAULT_SELECTORS, parseSelectorValue } from '../config-selectors.js';
import { assertAllowedUrl, canonicalizeOrigin } from '../security/url-policy.js';
import { resolveSafeRelativeUrl } from '../security/relative-url-policy.js';
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
  try { return fn(); } catch { issues.push(`${field} is invalid`); return fallback; }
}

export function readDocument(filePath: string): ProjectConfigDocumentV1 {
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
  const configured = sourceInput?.allowedOrigins ?? projectOrigins ?? defaultOrigins ?? project.allowedOrigins ?? defaults.allowedOrigins ?? fallback;
  return configured.map((origin, index) => safe(`${source} origin ${index + 1}`, '', () => canonicalizeOrigin(origin, `${source} origin`), issues)).filter(Boolean);
}

export function credentials(
  project: ProjectConfigInput,
  defaults: ProjectConfigDefaults,
): ProjectCredentialReferences {
  if (project.credentials !== undefined) return {
    usernameVariable: project.credentials.usernameVariable.trim(),
    passwordVariable: project.credentials.passwordVariable.trim(),
  };
  if (project.credentialVariables !== undefined) return {
    usernameVariable: project.credentialVariables.username.trim(),
    passwordVariable: project.credentialVariables.password.trim(),
  };
  if (defaults.credentials !== undefined) return {
    usernameVariable: defaults.credentials.usernameVariable.trim(),
    passwordVariable: defaults.credentials.passwordVariable.trim(),
  };
  if (defaults.credentialVariables !== undefined) return {
    usernameVariable: defaults.credentialVariables.username.trim(),
    passwordVariable: defaults.credentialVariables.password.trim(),
  };
  return { usernameVariable: 'JENKINS_USERNAME', passwordVariable: 'JENKINS_PASSWORD' };
}

function cloneSelector(value: LocatorSelector): LocatorSelector {
  return { kind: value.kind, value: value.value, required: value.required, ...(value.name === undefined ? {} : { name: value.name }) };
}

export function selectors(project: ProjectConfigInput, defaults: ProjectConfigDefaults): SelectorConfig {
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

export function normalizedSource(
  input: ProjectSourceInput | undefined,
  baseUrl: string,
  origins: readonly string[],
  fieldName: string,
  issues: string[],
): NormalizedSourceConfig {
  let reportPath: string | undefined;
  let homeUrl: string | undefined;
  let projectId: string | undefined;
  if (input?.reportPath !== undefined) reportPath = safe(fieldName, undefined, () => resolveSafeRelativeUrl(baseUrl, input.reportPath as string, fieldName), issues);
  if (input?.homeUrl !== undefined) homeUrl = safe(fieldName, undefined, () => assertAllowedUrl(input.homeUrl as string, baseUrl, origins, fieldName), issues);
  if (input?.projectId !== undefined) projectId = input.projectId.trim();
  return Object.freeze({
    allowedOrigins: Object.freeze([...origins]),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(homeUrl === undefined ? {} : { homeUrl }),
    ...(projectId === undefined ? {} : { projectId }),
  });
}
