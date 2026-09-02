import { ConfigError } from '../config-errors.js';
import { isRecord } from '../config-selectors.js';
import type { ProjectConfigDocumentV1 } from './config-types.js';
import {
  PROJECT_CONFIG_LIMITS,
  addUnknownKeys,
} from './project-config-field-validation.js';
import {
  ROOT_KEYS,
  validateDefaults,
  validateProject,
} from './project-config-project-validation.js';

export { PROJECT_CONFIG_LIMITS } from './project-config-field-validation.js';

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
  if (Array.isArray(value.projects)) {
    value.projects.forEach((item, index) => validateProject(item, index, issues));
  }
  if (value.defaults !== undefined) {
    validateDefaults(value.defaults, issues);
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
