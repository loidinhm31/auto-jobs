import {
  PROJECT_CONFIG_LIMITS,
} from '../../../config/project-config-schema.js';
import { DEFAULT_JOB_COLUMN } from '../../../config/project-job-matrix-upgrade.js';
import type {
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../types/index.js';
import { cloneProjectDraft } from '../utils/clone-project-draft.js';
import { computePrimaryJobUrl } from './matrix-document-transitions.js';

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
