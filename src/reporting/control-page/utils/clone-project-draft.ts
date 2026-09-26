import { PROJECT_CONFIG_LIMITS } from '../../../config/project-config-schema.js';
import type { ProjectConfigInput } from '../types/index.js';

export const MAX_PROJECT_ID_LENGTH = 63;
export const CLONE_NAME_SUFFIX = ' (copy)';

/**
 * Generates a unique, lowercase safe project ID for a cloned project.
 * - Suffix begins with '-copy', then '-copy-2', '-copy-3', etc.
 * - Truncates base source ID to ensure total length does not exceed 63 characters.
 * - Enforces uniqueness against existing project IDs.
 */
export function generateCloneProjectId(
  sourceId: string,
  existingIds: Iterable<string> | ReadonlySet<string>,
): string {
  const existingSet = existingIds instanceof Set ? existingIds : new Set(existingIds);
  const normalizedSource = (sourceId || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  const safeBase = normalizedSource.length > 0 ? normalizedSource : 'project';

  // First candidate: `<base>-copy`
  const initialSuffix = '-copy';
  const initialMaxBaseLen = MAX_PROJECT_ID_LENGTH - initialSuffix.length;
  const initialBase = safeBase.slice(0, initialMaxBaseLen);
  const initialCandidate = `${initialBase}${initialSuffix}`;

  if (!existingSet.has(initialCandidate)) {
    return initialCandidate;
  }

  // Iterative candidates: `<base>-copy-${counter}`
  let counter = 2;
  while (true) {
    const suffix = `-copy-${counter}`;
    const maxBaseLen = MAX_PROJECT_ID_LENGTH - suffix.length;
    const base = safeBase.slice(0, Math.max(1, maxBaseLen));
    const candidate = `${base}${suffix}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

/**
 * Generates a bounded name for a cloned project by appending ' (copy)'.
 * - Truncates source name if needed so the result does not exceed maxNameLength (200 characters).
 * - Name uniqueness is not required (IDs are authoritative).
 */
export function generateCloneProjectName(sourceName: string): string {
  const trimmed = (sourceName || '').trim();
  const baseName = trimmed.length > 0 ? trimmed : 'Project';
  const maxBaseLength = PROJECT_CONFIG_LIMITS.maxNameLength - CLONE_NAME_SUFFIX.length;

  if (baseName.length > maxBaseLength) {
    return `${baseName.slice(0, maxBaseLength)}${CLONE_NAME_SUFFIX}`;
  }
  return `${baseName}${CLONE_NAME_SUFFIX}`;
}

/**
 * Clones a project configuration into an independent, editable draft:
 * - Uses structuredClone to deeply copy raw settings without aliasing nested objects.
 * - Replaces identity with a unique bounded ID and bounded name.
 * - Sets enabled to false.
 * - Deletes groupId so the clone begins as Ungrouped.
 * - Preserves all other explicit raw settings, nested objects, and omitted overrides verbatim.
 */
export function cloneProjectDraft(
  source: ProjectConfigInput,
  existingProjects: readonly { id: string }[] | Iterable<string>,
): ProjectConfigInput {
  const existingIds = new Set<string>();
  for (const item of existingProjects) {
    if (typeof item === 'string') {
      existingIds.add(item);
    } else if (item && typeof item.id === 'string') {
      existingIds.add(item.id);
    }
  }

  const clone = structuredClone(source);
  delete clone.groupId;
  clone.id = generateCloneProjectId(source.id, existingIds);
  clone.name = generateCloneProjectName(source.name || source.id);
  clone.enabled = false;

  return clone;
}
