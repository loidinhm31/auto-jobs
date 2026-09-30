import { discoverRunManifests } from '../artifacts/aggregate-manifest-reader.js';
import type { ResolvedRunTarget } from './control-run-targets.js';

/**
 * Preflight check against retained on-disk report history under root lock.
 * Fails closed if a virtual ID collides with an unassociated or different historical artifact.
 */
export async function assertNoArtifactCollisions(
 reportRoot: string,
 targets: readonly ResolvedRunTarget[],
): Promise<void> {
 const discovery = await discoverRunManifests(reportRoot);
 for (const target of targets) {
  const matchingManifests = discovery.manifests.filter(
   (m) => m.manifest.project.id === target.virtualProjectId,
  );
  for (const item of matchingManifests) {
   const manifest = item.manifest;
   if (manifest.provenance) {
    if (
     manifest.provenance.sourceProjectId !== target.sourceProjectId ||
     manifest.provenance.columnId !== target.columnId
    ) {
     throw new Error(
      `Target '${target.virtualProjectId}' collides with historical artifact provenance '${manifest.provenance.sourceProjectId}::${manifest.provenance.columnId}'`,
     );
    }
   } else {
    throw new Error(
     `Target '${target.virtualProjectId}' collides with existing unassociated artifact history in '${item.relativeDirectory}'`,
    );
   }
  }
 }
}
