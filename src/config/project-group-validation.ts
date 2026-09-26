import { isRecord } from '../config-selectors.js';
import {
  PROJECT_CONFIG_LIMITS,
  addUnknownKeys,
  stringField,
} from './project-config-field-validation.js';

export const GROUP_KEYS: Record<string, true> = {
  id: true,
  name: true,
};

export const GROUP_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/u;

export function validateProjectGroup(
  value: unknown,
  index: number,
  issues: string[],
): void {
  const fieldName = `config.projectGroups[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return;
  }

  addUnknownKeys(value, GROUP_KEYS, fieldName, issues);
  stringField(value.id, `${fieldName}.id`, issues, 63);
  if (typeof value.id === 'string' && !GROUP_ID_REGEX.test(value.id)) {
    issues.push(`${fieldName}.id must use lowercase safe characters`);
  }
  stringField(
    value.name,
    `${fieldName}.name`,
    issues,
    PROJECT_CONFIG_LIMITS.maxNameLength,
  );
}

export function validateProjectGroups(
  groups: unknown,
  projects: unknown,
  issues: string[],
): void {
  if (groups === undefined) {
    if (Array.isArray(projects)) {
      projects.forEach((project, index) => {
        if (isRecord(project) && typeof project.groupId === 'string') {
          issues.push(
            `projects[${index}].groupId references unknown group: ${project.groupId}`,
          );
        }
      });
    }
    return;
  }

  if (!Array.isArray(groups)) {
    issues.push('config.projectGroups must be an array');
    return;
  }

  if (groups.length > PROJECT_CONFIG_LIMITS.maxGroups) {
    issues.push(
      `config.projectGroups must contain at most ${PROJECT_CONFIG_LIMITS.maxGroups} groups`,
    );
  }

  groups.forEach((group, index) => validateProjectGroup(group, index, issues));

  const groupIds = new Set<string>();
  for (const group of groups) {
    if (isRecord(group) && typeof group.id === 'string') {
      if (groupIds.has(group.id)) {
        issues.push(`duplicate group id: ${group.id}`);
      }
      groupIds.add(group.id);
    }
  }

  if (Array.isArray(projects)) {
    projects.forEach((project, index) => {
      if (isRecord(project) && typeof project.groupId === 'string') {
        if (!groupIds.has(project.groupId)) {
          issues.push(
            `projects[${index}].groupId references unknown group: ${project.groupId}`,
          );
        }
      }
    });
  }
}
