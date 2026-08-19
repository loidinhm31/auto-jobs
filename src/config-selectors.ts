import type {
  LocatorSelector,
  SelectorConfig,
  SelectorKind,
} from './types.js';

import { ConfigError } from './config-errors.js';

const SELECTOR_KINDS: readonly SelectorKind[] = [
  'role',
  'label',
  'testId',
  'text',
  'css',
];

export const DEFAULT_SELECTORS: SelectorConfig = {
  trigger: {
    kind: 'role',
    value: 'button',
    name: 'Build Now',
    required: true,
  },
  authLandmark: {
    kind: 'role',
    value: 'link',
    name: 'Log out',
    required: true,
  },
  queueUrl: {
    kind: 'css',
    value: 'a[href*="/queue/item/"]',
    required: false,
  },
  buildStatus: {
    kind: 'testId',
    value: 'jenkins-build-status',
    required: true,
  },
  buildUrl: {
    kind: 'testId',
    value: 'jenkins-build-url',
    required: true,
  },
  sonarqubeReport: {
    kind: 'testId',
    value: 'sonarqube-report',
    required: true,
  },
  snykReport: {
    kind: 'testId',
    value: 'snyk-report',
    required: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneSelector(selector: LocatorSelector): LocatorSelector {
  const copy: LocatorSelector = {
    kind: selector.kind,
    value: selector.value,
    required: selector.required,
  };
  if (selector.name !== undefined) {
    copy.name = selector.name;
  }
  return copy;
}

export function parseSelector(
  value: string,
  fieldName = 'selector',
  defaultRequired = true,
): LocatorSelector {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new ConfigError([`${fieldName} must be valid JSON`]);
  }
  if (!isRecord(parsed)) {
    throw new ConfigError([`${fieldName} must be a selector object`]);
  }

  const kind = parsed.kind;
  const selectorValue = parsed.value;
  const required = parsed.required;
  const name = parsed.name;
  if (
    typeof kind !== 'string' ||
    !SELECTOR_KINDS.includes(kind as SelectorKind)
  ) {
    throw new ConfigError([
      `${fieldName}.kind must be one of ${SELECTOR_KINDS.join(', ')}`,
    ]);
  }
  if (typeof selectorValue !== 'string' || selectorValue.trim().length === 0) {
    throw new ConfigError([`${fieldName}.value must be a non-empty string`]);
  }
  if (required !== undefined && typeof required !== 'boolean') {
    throw new ConfigError([`${fieldName}.required must be a boolean`]);
  }
  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    throw new ConfigError([`${fieldName}.name must be a non-empty string`]);
  }

  const selector: LocatorSelector = {
    kind: kind as SelectorKind,
    value: selectorValue.trim(),
    required: required ?? defaultRequired,
  };
  if (typeof name === 'string') {
    selector.name = name.trim();
  }
  return selector;
}

export function parseSelectorEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  issues: string[],
  defaultSelector: LocatorSelector,
  requiredEnv: boolean,
  readOptional: (source: NodeJS.ProcessEnv, name: string) => string | undefined,
): LocatorSelector {
  const raw = readOptional(env, key);
  if (raw === undefined) {
    if (requiredEnv) {
      issues.push(`${key} is required`);
    }
    return cloneSelector(defaultSelector);
  }
  try {
    return parseSelector(raw, key, defaultSelector.required);
  } catch {
    issues.push(`${key} must be a valid supported selector object`);
    return cloneSelector(defaultSelector);
  }
}
