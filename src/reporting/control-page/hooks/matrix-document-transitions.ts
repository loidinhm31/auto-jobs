import {
  COLUMN_ID_REGEX,
  PROJECT_CONFIG_LIMITS,
} from '../../../config/project-config-schema.js';
import { DEFAULT_JOB_COLUMN } from '../../../config/project-job-matrix-upgrade.js';
import type {
  JobColumnInput,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../types/index.js';
import { cloneProjectDraft } from '../utils/clone-project-draft.js';

export function computePrimaryJobUrl(
  jobs: Record<string, string> | undefined,
  columns: readonly JobColumnInput[],
): string {
  if (!jobs) return '';
  for (const col of columns) {
    const val = jobs[col.id];
    if (typeof val === 'string' && val.trim().length > 0) return val;
  }
  return '';
}

export function generateJobColumnId(
  existingColumns: readonly (JobColumnInput | string)[],
): string {
  const existingIds = new Set<string>();
  for (const col of existingColumns) {
    if (typeof col === 'string') existingIds.add(col.toLowerCase());
    else if (col && typeof col.id === 'string') existingIds.add(col.id.toLowerCase());
  }
  if (!existingIds.has('job')) return 'job';
  let counter = 2;
  while (true) {
    const candidate = `job-${counter}`;
    if (!existingIds.has(candidate)) return candidate;
    counter += 1;
  }
}

export function addJobColumn(
  document: ProjectConfigDocumentV1,
  column: JobColumnInput,
): ProjectConfigDocumentV1 {
  const currentColumns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  if (currentColumns.length >= PROJECT_CONFIG_LIMITS.maxJobColumns) return document;
  const trimmedId = column.id.trim().toLowerCase();
  const trimmedName = column.name.trim();
  if (!trimmedId || !trimmedName) return document;
  if (!COLUMN_ID_REGEX.test(trimmedId)) return document;
  if (currentColumns.some((col) => col.id === trimmedId)) return document;
  const nextColumns = [...currentColumns, { id: trimmedId, name: trimmedName }];
  const projects = document.projects.map((p) => ({
    ...p,
    jobs: { ...(p.jobs ?? {}), [trimmedId]: '' },
  }));
  return { ...document, jobColumns: nextColumns, projects };
}

export function renameJobColumn(
  document: ProjectConfigDocumentV1,
  columnId: string,
  newName: string,
): ProjectConfigDocumentV1 {
  const currentColumns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  const target = currentColumns.find((col) => col.id === columnId);
  if (!target) return document;
  const trimmed = newName.trim();
  if (!trimmed || trimmed.length > PROJECT_CONFIG_LIMITS.maxNameLength) return document;
  if (target.name === trimmed) return document;
  const nextColumns = currentColumns.map((col) =>
    col.id === columnId ? { ...col, name: trimmed } : col,
  );
  return { ...document, jobColumns: nextColumns };
}

export function removeJobColumn(
  document: ProjectConfigDocumentV1,
  columnId: string,
): ProjectConfigDocumentV1 | null {
  const currentColumns = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  if (currentColumns.length <= 1) return null;
  if (!currentColumns.some((col) => col.id === columnId)) return document;
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
  if (previous.jobs?.[columnId] === url) return document;
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
  const has = currentSelections.includes(columnId);
  if (selected === has) return document;

  let nextSelections: string[];
  if (selected) {
    nextSelections = [...currentSelections, columnId];
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
  for (const col of columns) initialJobs[col.id] = '';

  const newProject: ProjectConfigInput = {
    id: projectId,
    name: 'New Project',
    loginUrl: '',
    jobUrl: '',
    jobs: initialJobs,
    selectedJobColumns: [],
    runType: 'report',
    enabled: true,
  };

  return {
    document: { ...document, projects: [...document.projects, newProject] },
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
  for (const col of columns) jobs[col.id] = sourceProject.jobs?.[col.id] ?? '';
  cloned.jobs = jobs;
  cloned.jobUrl = computePrimaryJobUrl(jobs, columns);
  cloned.selectedJobColumns = [];

  return {
    document: { ...document, projects: [...document.projects, cloned] },
    projectId: cloned.id,
  };
}
