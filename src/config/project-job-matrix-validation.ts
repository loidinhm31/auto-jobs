import { ConfigError } from '../config-errors.js';
import { deriveJenkinsBaseUrl } from '../config-values.js';
import { isRecord } from '../config-selectors.js';
import {
  PROJECT_CONFIG_LIMITS,
  addUnknownKeys,
  exactUrl,
  stringField,
} from './project-config-field-validation.js';

export const COLUMN_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,15}$/u;
export const COLUMN_KEYS: Record<string, true> = { id: true, name: true };

export function validateJobColumn(
  value: unknown,
  index: number,
  issues: string[],
): string | undefined {
  const fieldName = `config.jobColumns[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${fieldName} must be an object`);
    return undefined;
  }
  addUnknownKeys(value, COLUMN_KEYS, fieldName, issues);
  stringField(value.id, `${fieldName}.id`, issues, PROJECT_CONFIG_LIMITS.maxColumnIdLength);
  if (typeof value.id === 'string' && !COLUMN_ID_REGEX.test(value.id)) {
    issues.push(`${fieldName}.id must use lowercase safe characters (at most 16 characters)`);
  }
  stringField(value.name, `${fieldName}.name`, issues, PROJECT_CONFIG_LIMITS.maxNameLength);
  if (typeof value.name === 'string' && value.name.trim().length === 0) {
    issues.push(`${fieldName}.name must not be empty`);
  }
  return typeof value.id === 'string' && COLUMN_ID_REGEX.test(value.id) ? value.id : undefined;
}

function validateProjectJobCells(
  jobs: unknown,
  loginUrl: unknown,
  fieldName: string,
  declaredColumns: readonly string[],
  issues: string[],
): void {
  if (!isRecord(jobs)) {
    issues.push(`${fieldName}.jobs must be an object`);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(jobs, '__proto__')) {
    issues.push(`${fieldName}.jobs.__proto__ is not supported`);
  }
  for (const key of Object.keys(jobs)) {
    if (key === '__proto__' || !declaredColumns.includes(key)) {
      issues.push(`${fieldName}.jobs.${key} is not supported`);
    }
  }
  for (const colId of declaredColumns) {
    if (!Object.prototype.hasOwnProperty.call(jobs, colId)) {
      issues.push(`${fieldName}.jobs.${colId} is required`);
      continue;
    }
    const cellValue = jobs[colId];
    if (typeof cellValue !== 'string') {
      issues.push(`${fieldName}.jobs.${colId} must be a string`);
      continue;
    }
    if (cellValue.trim().length > 0) {
      exactUrl(cellValue, `${fieldName}.jobs.${colId}`, issues);
      if (typeof loginUrl === 'string' && loginUrl.trim().length > 0) {
        try {
          deriveJenkinsBaseUrl(loginUrl, cellValue);
        } catch (error) {
          if (error instanceof ConfigError && error.issues.length > 0) issues.push(...error.issues);
          else issues.push(`${fieldName}.jobs.${colId} must share the Jenkins login context`);
        }
      }
    }
  }
}

function validateProjectSelection(
  selected: unknown,
  fieldName: string,
  declaredColumns: readonly string[],
  issues: string[],
): void {
  if (!Array.isArray(selected)) {
    issues.push(`${fieldName}.selectedJobColumns must be an array`);
    return;
  }
  const seen = new Set<string>();
  for (const item of selected) {
    if (typeof item !== 'string') {
      issues.push(`${fieldName}.selectedJobColumns elements must be strings`);
      continue;
    }
    if (!declaredColumns.includes(item)) {
      issues.push(`${fieldName}.selectedJobColumns contains undeclared column id: ${item}`);
    }
    if (seen.has(item)) {
      issues.push(`${fieldName}.selectedJobColumns contains duplicate column id: ${item}`);
    }
    seen.add(item);
  }
}

function validateProjectPrimaryMirror(
  jobs: unknown,
  jobUrl: unknown,
  fieldName: string,
  declaredColumns: readonly string[],
  issues: string[],
): void {
  if (!isRecord(jobs)) return;
  let firstNonblankUrl: string | undefined;
  let firstNonblankColId: string | undefined;
  for (const colId of declaredColumns) {
    if (Object.prototype.hasOwnProperty.call(jobs, colId)) {
      const val = jobs[colId];
      if (typeof val === 'string' && val.trim().length > 0) {
        firstNonblankUrl = val;
        firstNonblankColId = colId;
        break;
      }
    }
  }
  if (firstNonblankUrl === undefined) {
    issues.push(`${fieldName} must contain at least one nonblank job URL`);
  } else if (typeof jobUrl === 'string' && jobUrl !== firstNonblankUrl) {
    issues.push(`${fieldName}.jobUrl must mirror first nonblank job column URL (${firstNonblankColId})`);
  }
}

export function validateProjectJobMatrix(
  project: unknown,
  index: number,
  declaredColumns: readonly string[],
  issues: string[],
): void {
  const fieldName = `projects[${index}]`;
  if (!isRecord(project)) return;
  if (project.jobs === undefined) {
    issues.push(`${fieldName}.jobs must be an object`);
  } else {
    validateProjectJobCells(project.jobs, project.loginUrl, fieldName, declaredColumns, issues);
  }
  if (project.selectedJobColumns === undefined) {
    issues.push(`${fieldName}.selectedJobColumns must be an array`);
  } else {
    validateProjectSelection(project.selectedJobColumns, fieldName, declaredColumns, issues);
  }
  validateProjectPrimaryMirror(project.jobs, project.jobUrl, fieldName, declaredColumns, issues);
}

export function validateJobMatrix(
  jobColumns: unknown,
  projects: unknown,
  issues: string[],
): void {
  if (jobColumns === undefined) {
    if (Array.isArray(projects)) {
      projects.forEach((proj, idx) => {
        if (isRecord(proj)) {
          if (proj.jobs !== undefined) issues.push(`projects[${idx}].jobs is not supported without config.jobColumns`);
          if (proj.selectedJobColumns !== undefined) issues.push(`projects[${idx}].selectedJobColumns is not supported without config.jobColumns`);
        }
      });
    }
    return;
  }
  if (!Array.isArray(jobColumns) || jobColumns.length === 0 || jobColumns.length > PROJECT_CONFIG_LIMITS.maxJobColumns) {
    issues.push(`config.jobColumns must contain 1 to ${PROJECT_CONFIG_LIMITS.maxJobColumns} columns`);
    return;
  }
  const declaredColumns: string[] = [];
  const seenIds = new Set<string>();
  jobColumns.forEach((col, idx) => {
    const id = validateJobColumn(col, idx, issues);
    if (id !== undefined) {
      if (seenIds.has(id)) issues.push(`duplicate job column id: ${id}`);
      seenIds.add(id);
      declaredColumns.push(id);
    }
  });
  if (Array.isArray(projects)) {
    projects.forEach((proj, idx) => validateProjectJobMatrix(proj, idx, declaredColumns, issues));
  }
}
