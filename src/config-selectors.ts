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
const SELECTOR_FIELDS = new Set(['kind', 'value', 'name', 'required']);
const MAX_SELECTOR_TEXT_LENGTH = 512;

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
    name: 'Manage Jenkins',
    required: false,
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

export function isRecord(value: unknown): value is Record<string, unknown> {
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
  return parseSelectorValue(parsed, fieldName, defaultRequired);
}

export function parseSelectorValue(
  parsed: unknown,
  fieldName = 'selector',
  defaultRequired = true,
): LocatorSelector {
  if (!isRecord(parsed)) {
    throw new ConfigError([`${fieldName} must be a selector object`]);
  }

  for (const key of Object.keys(parsed)) {
    if (!SELECTOR_FIELDS.has(key)) {
      throw new ConfigError([`${fieldName}.${key} is not supported`]);
    }
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
  if (
    typeof selectorValue !== 'string' ||
    selectorValue.trim().length === 0 ||
    selectorValue.length > MAX_SELECTOR_TEXT_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(selectorValue)
  ) {
    throw new ConfigError([`${fieldName}.value must be a non-empty string`]);
  }
  if (required !== undefined && typeof required !== 'boolean') {
    throw new ConfigError([`${fieldName}.required must be a boolean`]);
  }
  if (
    name !== undefined &&
    (
      typeof name !== 'string' ||
      name.trim() === '' ||
      name.length > MAX_SELECTOR_TEXT_LENGTH ||
      /[\u0000-\u001f\u007f]/u.test(name)
    )
  ) {
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
