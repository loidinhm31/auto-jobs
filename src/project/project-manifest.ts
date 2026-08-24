import type { NormalizedProjectConfig } from '../config/config-types.js';
import type { ProjectRunManifest } from '../artifacts/artifact-manifest.js';
import { boundedDiagnostics } from '../workflow/diagnostics.js';
import type { ProjectOutcomeState } from './project-types.js';
import type { ProjectRunState } from './project-run-state.js';

export interface ProjectDiagnostics {
  readonly lastSafeUrl?: string;
  readonly status?: string;
  readonly observationErrors: readonly string[];
  readonly reloadCount: number;
}

export function createProjectManifest(
  project: NormalizedProjectConfig,
  state: ProjectRunState,
  resultState: ProjectOutcomeState,
  observedAt: string,
  warnings: readonly string[],
  diagnostic?: string,
  status?: string,
  diagnostics?: ProjectDiagnostics,
  screenshots: readonly string[] = [],
): ProjectRunManifest {
  return {
    kind: 'project-run',
    schemaVersion: 2,
    project: { id: project.id, name: project.name },
    run: { runId: state.identity.runId, observedAt },
    state: resultState,
    ...(state.build === undefined ? {} : {
      jenkins: {
        buildNumber: state.build.number,
        buildUrl: state.build.url,
        ...(status === undefined ? {} : { status }),
      },
    }),
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: [...screenshots] },
    warnings: [...warnings],
    ...(diagnostic === undefined ? {} : { diagnostic }),
    ...(diagnostics === undefined ? {} : {
      diagnostics: {
        ...diagnostics,
        observationErrors: boundedDiagnostics(diagnostics.observationErrors),
      },
    }),
  };
}
