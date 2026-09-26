import { PROJECT_CONFIG_LIMITS } from '../../../config/project-config-schema.js';
import type {
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectGroupInput,
} from '../types/index.js';

export function generateGroupId(
  existingGroupIds: ReadonlySet<string> | readonly string[],
): string {
  const ids = existingGroupIds instanceof Set ? existingGroupIds : new Set(existingGroupIds);
  let id = 'group';
  for (let suffix = 2; ids.has(id); suffix += 1) {
    id = `group-${suffix}`;
  }
  return id;
}

export function createProjectGroup(
  document: ProjectConfigDocumentV1,
  name?: string,
): { document: ProjectConfigDocumentV1; groupId: string } | null {
  const currentGroups = document.projectGroups ?? [];
  if (currentGroups.length >= PROJECT_CONFIG_LIMITS.maxGroups) {
    return null;
  }

  const existingIds = new Set(currentGroups.map((group) => group.id));
  const groupId = generateGroupId(existingIds);
  const trimmedName = name?.trim();
  const groupName =
    trimmedName && trimmedName.length > 0
      ? trimmedName.slice(0, PROJECT_CONFIG_LIMITS.maxNameLength)
      : 'New Group';

  const newGroup: ProjectGroupInput = {
    id: groupId,
    name: groupName,
  };

  return {
    document: {
      ...document,
      projectGroups: [...currentGroups, newGroup],
    },
    groupId,
  };
}

export function renameProjectGroup(
  document: ProjectConfigDocumentV1,
  groupId: string,
  name: string,
): ProjectConfigDocumentV1 {
  const currentGroups = document.projectGroups;
  if (!currentGroups || currentGroups.length === 0) {
    return document;
  }

  const groupIndex = currentGroups.findIndex((group) => group.id === groupId);
  if (groupIndex === -1) {
    return document;
  }

  const trimmedName = name.trim().slice(0, PROJECT_CONFIG_LIMITS.maxNameLength);
  if (trimmedName.length === 0 || trimmedName === currentGroups[groupIndex]?.name) {
    return document;
  }

  const projectGroups = [...currentGroups];
  const existingGroup = projectGroups[groupIndex];
  if (!existingGroup) {
    return document;
  }

  projectGroups[groupIndex] = {
    ...existingGroup,
    name: trimmedName,
  };

  return {
    ...document,
    projectGroups,
  };
}

export function deleteProjectGroup(
  document: ProjectConfigDocumentV1,
  groupId: string,
): ProjectConfigDocumentV1 {
  const currentGroups = document.projectGroups;
  if (!currentGroups || !currentGroups.some((group) => group.id === groupId)) {
    return document;
  }

  const projectGroups = currentGroups.filter((group) => group.id !== groupId);
  let projectsChanged = false;

  const projects = document.projects.map((project) => {
    if (project.groupId === groupId) {
      projectsChanged = true;
      const { groupId: _, ...rest } = project;
      return rest as ProjectConfigInput;
    }
    return project;
  });

  return {
    ...document,
    projectGroups,
    projects: projectsChanged ? projects : document.projects,
  };
}

export function replaceGroupMembership(
  document: ProjectConfigDocumentV1,
  groupId: string,
  selectedProjectIds: readonly string[],
): ProjectConfigDocumentV1 {
  const currentGroups = document.projectGroups;
  if (!currentGroups || !currentGroups.some((group) => group.id === groupId)) {
    return document;
  }

  const projectIdsSet = new Set(document.projects.map((project) => project.id));
  for (const selectedId of selectedProjectIds) {
    if (!projectIdsSet.has(selectedId)) {
      return document;
    }
  }

  const selectedSet = new Set(selectedProjectIds);
  let hasChanges = false;

  const updatedProjects = document.projects.map((project) => {
    const isSelected = selectedSet.has(project.id);
    const isCurrentlyInTarget = project.groupId === groupId;

    if (isSelected) {
      if (!isCurrentlyInTarget) {
        hasChanges = true;
        return {
          ...project,
          groupId,
        };
      }
      return project;
    }

    if (isCurrentlyInTarget) {
      hasChanges = true;
      const { groupId: _, ...rest } = project;
      return rest as ProjectConfigInput;
    }

    return project;
  });

  if (!hasChanges) {
    return document;
  }

  return {
    ...document,
    projects: updatedProjects,
  };
}

export function getGroupProjects(
  document: ProjectConfigDocumentV1,
  groupId: string | null | undefined,
): readonly ProjectConfigInput[] {
  if (!groupId) {
    return document.projects.filter(
      (project) => !project.groupId || project.groupId.trim().length === 0,
    );
  }
  return document.projects.filter((project) => project.groupId === groupId);
}
