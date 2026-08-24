import type { ProjectOutcomeState } from '../project/project-types.js';

export interface ProjectRunManifest {
  readonly kind: 'project-run';
  readonly schemaVersion: 2;
  readonly project: { readonly id: string; readonly name: string };
  readonly run: { readonly runId: string; readonly observedAt: string };
  readonly state: ProjectOutcomeState;
  readonly jenkins?: {
    readonly buildNumber: number;
    readonly buildUrl: string;
    readonly status?: string;
  };
  readonly artifacts: {
    readonly manifest: 'manifest.json';
    readonly data: 'data.json';
    readonly screenshots: readonly string[];
    readonly trace?: 'trace.zip';
  };
  readonly warnings: readonly string[];
  readonly diagnostic?: string;
  readonly diagnostics?: {
    readonly lastSafeUrl?: string;
    readonly status?: string;
    readonly observationErrors: readonly string[];
    readonly reloadCount: number;
  };
}

export interface ProjectFailureResultV2 {
  readonly schemaVersion: 2;
  readonly project: { readonly id: string; readonly name: string };
  readonly run: { readonly runId: string; readonly observedAt: string };
  readonly state: 'failed';
  readonly jenkins?: { readonly buildNumber: number; readonly buildUrl: string };
  readonly diagnostic: string;
  readonly warnings: readonly string[];
  readonly diagnostics?: ProjectRunManifest['diagnostics'];
}

export interface DiscoveredRunManifest {
  readonly manifest: ProjectRunManifest;
  readonly relativeDirectory: string;
  readonly manifestPath: string;
}

export interface ManifestDiscoveryResult {
  readonly manifests: readonly DiscoveredRunManifest[];
  readonly warnings: readonly string[];
}
