import { COLUMN_ID_REGEX } from '../config/project-job-matrix-validation.js';

export const SAFE_PROJECT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/u;
export const MAX_TARGET_COORDINATES = 2500;

export interface RunTargetCoordinate {
 readonly projectId: string;
 readonly columnId: string;
}

export interface TargetProvenance {
 readonly sourceProjectId: string;
 readonly sourceProjectName: string;
 readonly columnId: string;
 readonly columnName: string;
 readonly jobUrl: string;
}

export interface TargetValidationResult {
 readonly valid: boolean;
 readonly status?: number;
 readonly code?: string;
 readonly message?: string;
 readonly coordinates?: readonly RunTargetCoordinate[];
}

/**
 * Validates the raw `targets` payload from an API request.
 * Requires a non-empty bounded array of 1-2500 coordinates,
 * each with exactly `projectId` and `columnId` safe strings,
 * without duplicates.
 */
export function validateRunTargetCoordinates(value: unknown): TargetValidationResult {
 if (!Array.isArray(value)) {
  return { valid: false, status: 422, code: 'INVALID_TARGETS', message: 'targets must be an array' };
 }
 if (value.length === 0) {
  return { valid: false, status: 422, code: 'INVALID_TARGETS', message: 'targets array must not be empty' };
 }
 if (value.length > MAX_TARGET_COORDINATES) {
  return { valid: false, status: 422, code: 'INVALID_TARGETS', message: `targets array must not exceed ${MAX_TARGET_COORDINATES} coordinates` };
 }

 const coordinates: RunTargetCoordinate[] = [];
 const seenCoordinates = new Set<string>();

 for (let i = 0; i < value.length; i++) {
  const item = value[i];
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
   return {
    valid: false,
    status: 422,
    code: 'INVALID_TARGETS',
    message: `targets[${i}] must be an object`,
   };
  }

  const keys = Object.keys(item);
  if (keys.length !== 2 || !keys.includes('projectId') || !keys.includes('columnId')) {
   return {
    valid: false,
    status: 422,
    code: 'INVALID_TARGETS',
    message: `targets[${i}] must contain only projectId and columnId`,
   };
  }

  const { projectId, columnId } = item as Record<string, unknown>;

  if (
   typeof projectId !== 'string' ||
   projectId.length === 0 ||
   projectId.length > 63 ||
   !SAFE_PROJECT_ID_REGEX.test(projectId)
  ) {
   return {
    valid: false,
    status: 422,
    code: 'INVALID_TARGETS',
    message: `targets[${i}].projectId must be a lowercase safe identifier (1-63 chars)`,
   };
  }

  if (
   typeof columnId !== 'string' ||
   columnId.length === 0 ||
   columnId.length > 16 ||
   !COLUMN_ID_REGEX.test(columnId)
  ) {
   return {
    valid: false,
    status: 422,
    code: 'INVALID_TARGETS',
    message: `targets[${i}].columnId must be a lowercase safe identifier (1-16 chars)`,
   };
  }

  const coordKey = `${projectId}::${columnId}`;
  if (seenCoordinates.has(coordKey)) {
   return {
    valid: false,
    status: 422,
    code: 'INVALID_TARGETS',
    message: `targets contains duplicate coordinate: ${projectId}, ${columnId}`,
   };
  }
  seenCoordinates.add(coordKey);
  coordinates.push({ projectId, columnId });
 }

 return { valid: true, coordinates: Object.freeze(coordinates) };
}

export const ALLOWED_MATRIX_RUN_KEYS = new Set([
 'configName',
 'configEtag',
 'runType',
 'targets',
 'waitForCompletion',
 'waitTimeoutMs',
]);

export interface RunApiTargetsResolution {
 readonly ok: boolean;
 readonly status?: number | undefined;
 readonly code?: string | undefined;
 readonly message?: string | undefined;
 readonly targets?: readonly RunTargetCoordinate[] | undefined;
 readonly projectId?: string | undefined;
}

export function parseRunApiTargets(
 data: Record<string, unknown>,
 runType: 'report' | 'auto-build',
): RunApiTargetsResolution {
 if (Object.hasOwn(data, 'targets')) {
  if (Object.hasOwn(data, 'projectId')) {
   return {
    ok: false,
    status: 422,
    code: 'INVALID_TARGETS',
    message: 'projectId must not be provided when targets are specified',
   };
  }
  for (const key of Object.keys(data)) {
   if (!ALLOWED_MATRIX_RUN_KEYS.has(key)) {
    return {
     ok: false,
     status: 422,
     code: 'INVALID_TARGETS',
     message: `unknown field '${key}' is not allowed in matrix run requests`,
    };
   }
  }
  const targetValidation = validateRunTargetCoordinates(data['targets']);
  if (!targetValidation.valid) {
   return {
    ok: false,
    status: targetValidation.status ?? 422,
    code: targetValidation.code ?? 'INVALID_TARGETS',
    message: targetValidation.message ?? 'Invalid targets',
   };
  }
  return { ok: true, targets: targetValidation.coordinates };
 }

 let projectId: string | undefined;
 if (runType === 'auto-build') {
  if (Object.hasOwn(data, 'projectId')) {
   if (typeof data['projectId'] !== 'string' || data['projectId'].trim().length === 0) {
    return {
     ok: false,
     status: 422,
     code: 'INVALID_PROJECT_ID',
     message: 'projectId must be a non-empty string when provided',
    };
   }
   projectId = data['projectId'].trim();
  }
 } else {
  projectId = typeof data['projectId'] === 'string' ? data['projectId'] : undefined;
 }
 if (projectId !== undefined) {
  return { ok: true, projectId };
 }
 return { ok: true };
}
