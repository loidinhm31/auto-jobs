import type { NormalizedProjectConfig } from '../config/config-types.js';
import type { ProjectRunManifest } from '../artifacts/artifact-manifest.js';
import { boundedDiagnostics } from '../workflow/diagnostics.js';
import type { ProjectOutcomeState } from './project-types.js';
import type { ProjectRunState } from './project-run-state.js';

export interface ProjectDiagnostics {
  readonly lastSafeUrl?: string;
  readonly observationErrors: readonly string[];
}

export interface ProjectManifestOptions {
  readonly jobUrl?: string;
  readonly diagnostic?: string;
  readonly diagnostics?: ProjectDiagnostics;
  readonly screenshots?: readonly string[];
}

export function createProjectManifest(
  project: NormalizedProjectConfig,
  state: ProjectRunState,
  resultState: ProjectOutcomeState,
  observedAt: string,
  warnings: readonly string[],
  options: ProjectManifestOptions = {},
): ProjectRunManifest {
  return {
    kind: 'project-run',
    schemaVersion: 3,
    project: { id: project.id, name: project.name },
    run: { runId: state.identity.runId, observedAt },
    state: resultState,
    ...(options.jobUrl === undefined ? {} : { jenkins: { jobUrl: options.jobUrl } }),
    artifacts: {
      manifest: 'manifest.json',
      data: 'data.json',
      screenshots: [...(options.screenshots ?? [])],
    },
    warnings: [...warnings],
    ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
    ...(options.diagnostics === undefined ? {} : {
      diagnostics: {
        ...options.diagnostics,
        observationErrors: boundedDiagnostics(options.diagnostics.observationErrors),
      },
    }),
  };
}
