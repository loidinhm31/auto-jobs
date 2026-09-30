import type { JobColumnInput, ProjectConfigDocumentV1 } from './config-types.js';

export const DEFAULT_JOB_COLUMN: JobColumnInput = Object.freeze({
 id: 'default',
 name: 'Job URL',
});

/**
 * Projects a schema-v1 configuration document into the matrix format in memory.
 *
 * If the document already declares `jobColumns`, it is returned unchanged (preserving
 * explicit column declarations, cell URLs, and selection choices including explicit []).
 *
 * If `jobColumns` is absent (legacy single-job format), projects one default shared column
 * `{ id: 'default', name: 'Job URL' }`, maps each project's existing `jobUrl` into
 * `jobs: { default: project.jobUrl }`, and selects `['default']`.
 *
 * This operation is pure, synchronous, lossless, and idempotent:
 * `projectLegacyMatrixDocument(projectLegacyMatrixDocument(doc))` is deeply equal to
 * `projectLegacyMatrixDocument(doc)`.
 */
export function projectLegacyMatrixDocument(
 document: ProjectConfigDocumentV1,
): ProjectConfigDocumentV1 {
 if (document.jobColumns !== undefined) {
  return document;
 }

 return {
  ...document,
  jobColumns: [DEFAULT_JOB_COLUMN],
  projects: document.projects.map((project) => ({
   ...project,
   jobs: { default: project.jobUrl },
   selectedJobColumns: ['default'],
  })),
 };
}
