/**
 * Control run targets resolution, validation, and collision safety for Phase 04 multi-job matrix runs.
 */
import { normalizeConfiguredUrl } from '../config-values.js';
import { deriveJenkinsBaseUrl } from '../config-values.js';
import { normalizeProjectConfigDocument } from '../config/project-config-loader.js';
import { projectLegacyMatrixDocument } from '../config/project-job-matrix-upgrade.js';
import type { NormalizedProjectConfig, ProjectConfigDocumentV1 } from '../config/config-types.js';
import type {
 RunTargetCoordinate,
 TargetProvenance,
} from './control-run-targets-validation.js';

export * from './control-run-targets-validation.js';
export * from './control-run-targets-collision.js';

export interface ResolvedRunTarget {
 readonly coordinate: RunTargetCoordinate;
 readonly sourceProjectId: string;
 readonly sourceProjectName: string;
 readonly columnId: string;
 readonly columnName: string;
 readonly jobUrl: string;
 readonly virtualProjectId: string;
 readonly virtualProjectName: string;
 readonly virtualProject: NormalizedProjectConfig;
}

export interface ResolveTargetsResult {
 readonly targets: readonly ResolvedRunTarget[];
 readonly skippedCoordinates: readonly RunTargetCoordinate[];
}

export interface ReportProjectRunOutcome {
 readonly targetId: string;
 readonly projectId: string;
 readonly projectName: string;
 readonly columnId?: string | undefined;
 readonly columnName?: string | undefined;
 readonly jobUrl: string;
 readonly runId?: string | undefined;
 readonly status: 'success' | 'partial' | 'failed';
 readonly reportUrl?: string | undefined;
 readonly error?: string | undefined;
 readonly warnings?: readonly string[] | undefined;
}

/**
 * Resolves coordinate pairs against an ETag-matched saved document.
 * Filters empty/whitespace cells, ensures deterministic ordering (by saved project
 * order then column heading order), formulates virtual projects, and performs
 * preflight validation (unknown/disabled projects, undeclared columns, ID collisions).
 */
export function resolveRunTargets(
 document: ProjectConfigDocumentV1,
 coordinates: readonly RunTargetCoordinate[],
 runType: 'report' | 'auto-build',
 runEnv: NodeJS.ProcessEnv,
): ResolveTargetsResult {
 const upgradedDoc = projectLegacyMatrixDocument(document);
 const normalizedProjects = normalizeProjectConfigDocument(upgradedDoc, runEnv);

 const normalizedMap = new Map<string, NormalizedProjectConfig>();
 for (const proj of normalizedProjects) {
  normalizedMap.set(proj.id, proj);
 }

 const declaredColumns = upgradedDoc.jobColumns ?? [];
 const columnMap = new Map<string, string>();
 for (const col of declaredColumns) {
  columnMap.set(col.id, col.name);
 }

 const requestedMap = new Map<string, RunTargetCoordinate>();
 for (const coord of coordinates) {
  requestedMap.set(`${coord.projectId}::${coord.columnId}`, coord);
 }

 const realProjectIds = new Set<string>();
 const rawProjectMap = new Map<string, (typeof upgradedDoc.projects)[number]>();
 for (const proj of upgradedDoc.projects) {
  realProjectIds.add(proj.id);
  rawProjectMap.set(proj.id, proj);
 }

 // Preflight validation for every requested coordinate
 for (const coord of coordinates) {
  const rawProj = rawProjectMap.get(coord.projectId);
  if (!rawProj) {
   throw new Error(`Unknown project id: '${coord.projectId}'`);
  }
  if (rawProj.enabled === false) {
   throw new Error(`Project '${coord.projectId}' is disabled`);
  }
  if (!columnMap.has(coord.columnId)) {
   throw new Error(`Undeclared column id: '${coord.columnId}'`);
  }

  const virtualId = `${coord.projectId}--${coord.columnId}`;
  if (realProjectIds.has(virtualId)) {
   throw new Error(`Virtual target id '${virtualId}' collides with an existing project id`);
  }
 }

 const resolvedTargets: ResolvedRunTarget[] = [];
 const skippedCoordinates: RunTargetCoordinate[] = [];
 const seenVirtualIds = new Set<string>();

 // Deterministic ordering: saved project order then shared column order
 for (const rawProj of upgradedDoc.projects) {
  if (rawProj.enabled === false) continue;
  const normalizedProj = normalizedMap.get(rawProj.id);
  if (!normalizedProj) continue;

  for (const col of declaredColumns) {
   const key = `${rawProj.id}::${col.id}`;
   const requested = requestedMap.get(key);
   if (!requested) continue;

   const rawUrl = rawProj.jobs?.[col.id];
   if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    skippedCoordinates.push(requested);
    continue;
   }

   const trimmedUrl = rawUrl.trim();
   const normalizedCellUrl = normalizeConfiguredUrl(
    trimmedUrl,
    `projects[${rawProj.id}].jobs[${col.id}]`,
   );
   deriveJenkinsBaseUrl(normalizedProj.loginUrl, normalizedCellUrl);

   const virtualId = `${rawProj.id}--${col.id}`;
   if (seenVirtualIds.has(virtualId)) {
    throw new Error(`Virtual target id collision: '${virtualId}'`);
   }
   seenVirtualIds.add(virtualId);

   const virtualProjectName = `${normalizedProj.name} [${col.name}]`;
   const provenance: TargetProvenance = {
    sourceProjectId: rawProj.id,
    sourceProjectName: normalizedProj.name,
    columnId: col.id,
    columnName: col.name,
    jobUrl: normalizedCellUrl,
   };

   const virtualProject: NormalizedProjectConfig = {
    ...normalizedProj,
    id: virtualId,
    name: virtualProjectName,
    jobUrl: normalizedCellUrl,
    runType,
    enabled: true,
    provenance,
   };

   resolvedTargets.push({
    coordinate: requested,
    sourceProjectId: rawProj.id,
    sourceProjectName: normalizedProj.name,
    columnId: col.id,
    columnName: col.name,
    jobUrl: normalizedCellUrl,
    virtualProjectId: virtualId,
    virtualProjectName,
    virtualProject,
   });
  }
 }

 if (resolvedTargets.length === 0) {
  throw new Error('No executable targets remaining after skipping blank cells');
 }

 return {
  targets: Object.freeze(resolvedTargets),
  skippedCoordinates: Object.freeze(skippedCoordinates),
 };
}
