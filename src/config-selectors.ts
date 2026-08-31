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
const SELECTOR_FIELDS: Record<string, true> = {
  kind: true,
  value: true,
  name: true,
  required: true,
};
const MAX_SELECTOR_TEXT_LENGTH = 512;

export const DEFAULT_SELECTORS: SelectorConfig = {
  authLandmark: {
    kind: 'role',
    value: 'link',
    name: 'Manage Jenkins',
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


export function parseSelectorValue(
  parsed: unknown,
  fieldName = 'selector',
  defaultRequired = true,
): LocatorSelector {
  if (!isRecord(parsed)) {
    throw new ConfigError([`${fieldName} must be a selector object`]);
  }

  for (const key of Object.keys(parsed)) {
    if (SELECTOR_FIELDS[key] !== true) {
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

