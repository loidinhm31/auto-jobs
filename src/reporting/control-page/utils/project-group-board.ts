import type { ProjectCardData } from '../types/component-contracts.js';
import type { ProjectGroupInput } from '../types/index.js';

export interface ProjectGroupColumnModel {
  groupId: string | null;
  groupName: string;
  projects: readonly ProjectCardData[];
}

/**
 * Builds group buckets in one pass using Map.
 * - Always includes Ungrouped as the first column.
 * - Preserves root group order for subsequent columns.
 * - Preserves project ordering within each bucket.
 * - Routes projects with undefined, null, or dangling group IDs to Ungrouped.
 * - Renders empty groups with an empty projects array.
 */
export function buildProjectGroupColumns(
  projects: readonly ProjectCardData[],
  groups: readonly ProjectGroupInput[] = [],
): readonly ProjectGroupColumnModel[] {
  const validGroupIds = new Set(groups.map((group) => group.id));
  const buckets = new Map<string | null, ProjectCardData[]>();

  // Ungrouped is always first
  buckets.set(null, []);

  // Follow root group order
  for (const group of groups) {
    buckets.set(group.id, []);
  }

  // Single-pass bucket population
  for (const project of projects) {
    const targetId =
      project.groupId && validGroupIds.has(project.groupId)
        ? project.groupId
        : null;
    buckets.get(targetId)!.push(project);
  }

  const columns: ProjectGroupColumnModel[] = [
    {
      groupId: null,
      groupName: 'Ungrouped',
      projects: buckets.get(null) ?? [],
    },
    ...groups.map((group) => ({
      groupId: group.id,
      groupName: group.name,
      projects: buckets.get(group.id) ?? [],
    })),
  ];

  return columns;
}
