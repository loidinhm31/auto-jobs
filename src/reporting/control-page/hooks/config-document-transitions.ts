import { PROJECT_CONFIG_LIMITS } from '../../../config/project-config-schema.js';
import type {
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../types/index.js';

export type ProjectUpdate =
  | Partial<ProjectConfigInput>
  | ((previous: ProjectConfigInput) => ProjectConfigInput);

export function addProjectDraft(document: ProjectConfigDocumentV1): {
  document: ProjectConfigDocumentV1;
  projectId: string;
} | null {
  if (document.projects.length >= PROJECT_CONFIG_LIMITS.maxProjects) return null;
  const ids = new Set(document.projects.map((project) => project.id));
  let projectId = 'new-project';
  for (let suffix = 2; ids.has(projectId); suffix += 1) projectId = `new-project-${suffix}`;
  return {
    document: {
      ...document,
      projects: [...document.projects, {
        id: projectId,
        name: 'New Project',
        loginUrl: '',
        jobUrl: '',
        runType: 'report',
        enabled: true,
      }],
    },
    projectId,
  };
}

export function updateProjectDocumentAt(
  document: ProjectConfigDocumentV1,
  projectIndex: number,
  update: ProjectUpdate,
): ProjectConfigDocumentV1 {
  const previous = document.projects[projectIndex];
  if (!previous) return document;
  const project = typeof update === 'function' ? update(previous) : { ...previous, ...update };
  const projects = [...document.projects];
  projects[projectIndex] = project;
  return { ...document, projects };
}

export function removeProjectDocumentAt(
  document: ProjectConfigDocumentV1,
  projectIndex: number,
): ProjectConfigDocumentV1 | null {
  if (document.projects.length <= 1 || !document.projects[projectIndex]) return null;
  const projects = document.projects.filter((_, index) => index !== projectIndex);
  if (!projects.some((project) => project.enabled !== false)) return null;
  return { ...document, projects };
}

export function updateProjectDocumentDefaults(
  document: ProjectConfigDocumentV1,
  update: (previous: ProjectConfigDefaults) => ProjectConfigDefaults,
): ProjectConfigDocumentV1 {
  const defaults = update(document.defaults ?? {});
  const updated = { ...document };
  if (Object.keys(defaults).length > 0) updated.defaults = defaults;
  else delete updated.defaults;
  return updated;
}
