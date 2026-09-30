import { PROJECT_CONFIG_LIMITS } from '../../../config/project-config-schema.js';
import { DEFAULT_JOB_COLUMN } from '../../../config/project-job-matrix-upgrade.js';
import type {
  JobColumnInput,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../types/index.js';
import { cloneProjectDraft } from '../utils/clone-project-draft.js';

function computePrimaryJobUrl(
  jobs: Record<string, string>,
  columns: readonly JobColumnInput[],
): string {
  for (const col of columns) {
    const val = jobs[col.id]?.trim();
    if (val && val.length > 0) return val;
  }
  return '';
}

export function addJobColumn(
  document: ProjectConfigDocumentV1,
  column: JobColumnInput,
): ProjectConfigDocumentV1 {
  const currentColumns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  if (currentColumns.some((col) => col.id === column.id)) return document;
  const nextColumns = [...currentColumns, { id: column.id, name: column.name.trim() }];
  const projects = document.projects.map((p) => ({
    ...p,
    jobs: { ...(p.jobs ?? {}), [column.id]: '' },
  }));
  return { ...document, jobColumns: nextColumns, projects };
}

export function renameJobColumn(
  document: ProjectConfigDocumentV1,
  columnId: string,
  newName: string,
): ProjectConfigDocumentV1 {
  const currentColumns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  const nextColumns = currentColumns.map((col) =>
    col.id === columnId ? { ...col, name: newName.trim() } : col,
  );
  return { ...document, jobColumns: nextColumns };
}

export function removeJobColumn(
  document: ProjectConfigDocumentV1,
  columnId: string,
): ProjectConfigDocumentV1 | null {
  const currentColumns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  if (currentColumns.length <= 1) return null;
  const nextColumns = currentColumns.filter((col) => col.id !== columnId);
  const projects = document.projects.map((p) => {
    const { [columnId]: _removed, ...restJobs } = p.jobs ?? {};
    const nextSelections = (p.selectedJobColumns ?? []).filter((id) => id !== columnId);
    const nextPrimary = computePrimaryJobUrl(restJobs, nextColumns);
    return {
      ...p,
      jobs: restJobs,
      selectedJobColumns: nextSelections,
      jobUrl: nextPrimary,
    };
  });
  return { ...document, jobColumns: nextColumns, projects };
}

export function updateJobCell(
  document: ProjectConfigDocumentV1,
  projectIndex: number,
  columnId: string,
  url: string,
): ProjectConfigDocumentV1 {
  const previous = document.projects[projectIndex];
  if (!previous) return document;
  const columns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  const nextJobs = { ...(previous.jobs ?? {}), [columnId]: url };
  const nextPrimary = computePrimaryJobUrl(nextJobs, columns);
  const updatedProject = {
    ...previous,
    jobs: nextJobs,
    jobUrl: nextPrimary,
  };
  const projects = [...document.projects];
  projects[projectIndex] = updatedProject;
  return { ...document, projects };
}

export function toggleProjectJobSelection(
  document: ProjectConfigDocumentV1,
  projectIndex: number,
  columnId: string,
  selected: boolean,
): ProjectConfigDocumentV1 {
  const previous = document.projects[projectIndex];
  if (!previous) return document;
  const currentSelections = previous.selectedJobColumns ?? [];
  let nextSelections: string[];
  if (selected) {
    nextSelections = currentSelections.includes(columnId)
      ? [...currentSelections]
      : [...currentSelections, columnId];
  } else {
    nextSelections = currentSelections.filter((id) => id !== columnId);
  }
  const projects = [...document.projects];
  projects[projectIndex] = { ...previous, selectedJobColumns: nextSelections };
  return { ...document, projects };
}

export function addProjectMatrixDraft(document: ProjectConfigDocumentV1): {
  document: ProjectConfigDocumentV1;
  projectId: string;
} | null {
  if (document.projects.length >= PROJECT_CONFIG_LIMITS.maxProjects) return null;
  const ids = new Set(document.projects.map((p) => p.id));
  let projectId = 'new-project';
  for (let suffix = 2; ids.has(projectId); suffix += 1) projectId = `new-project-${suffix}`;

  const columns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  const initialJobs: Record<string, string> = {};
  const firstCol = columns[0];
  const initialSelections = firstCol ? [firstCol.id] : [];

  const newProject: ProjectConfigInput = {
    id: projectId,
    name: 'New Project',
    loginUrl: '',
    jobUrl: '',
    jobs: initialJobs,
    selectedJobColumns: initialSelections,
    runType: 'report',
    enabled: true,
  };

  return {
    document: {
      ...document,
      projects: [...document.projects, newProject],
    },
    projectId,
  };
}

export function cloneProjectMatrixDraft(
  document: ProjectConfigDocumentV1,
  sourceProject: ProjectConfigInput,
): { document: ProjectConfigDocumentV1; projectId: string } | null {
  if (document.projects.length >= PROJECT_CONFIG_LIMITS.maxProjects) return null;
  const cloned = cloneProjectDraft(sourceProject, document.projects);
  const columns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  const jobs: Record<string, string> = {};
  for (const col of columns) {
    jobs[col.id] = sourceProject.jobs?.[col.id] ?? '';
  }
  cloned.jobs = jobs;
  cloned.selectedJobColumns = sourceProject.selectedJobColumns
    ? [...sourceProject.selectedJobColumns]
    : [];

  return {
    document: {
      ...document,
      projects: [...document.projects, cloned],
    },
    projectId: cloned.id,
  };
}
