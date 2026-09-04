import type { ProjectConfigDocumentV1 } from '../types/index.js';

/**
 * Extracts unique credential variable keys from the configuration document.
 * Scans each project's credential configuration (or fallback defaults),
 * defaulting to JENKINS_USERNAME and JENKINS_PASSWORD if unspecified.
 * Returns an empty array if doc is null/undefined or has no projects.
 */
export function discoverRequiredCredentialKeys(
  doc: ProjectConfigDocumentV1 | null | undefined,
): string[] {
  if (!doc || !Array.isArray(doc.projects) || doc.projects.length === 0) {
    return [];
  }

  const defaults = doc.defaults as
    | {
        credentials?: { usernameVariable?: unknown; passwordVariable?: unknown };
        credentialVariables?: { usernameVariable?: unknown; passwordVariable?: unknown };
      }
    | undefined;

  const defaultCreds = defaults?.credentials ?? defaults?.credentialVariables;
  const defaultUser =
    (typeof defaultCreds?.usernameVariable === 'string' &&
      defaultCreds.usernameVariable.trim()) ||
    'JENKINS_USERNAME';
  const defaultPass =
    (typeof defaultCreds?.passwordVariable === 'string' &&
      defaultCreds.passwordVariable.trim()) ||
    'JENKINS_PASSWORD';

  const keys = new Set<string>();

  for (const p of doc.projects) {
    if (!p || typeof p !== 'object') continue;

    const projectWithCreds = p as {
      credentials?: { usernameVariable?: unknown; passwordVariable?: unknown };
      credentialVariables?: unknown;
    };

    const credVars = projectWithCreds.credentialVariables;
    if (Array.isArray(credVars)) {
      for (const k of credVars) {
        if (typeof k === 'string' && k.trim().length > 0) {
          keys.add(k.trim());
        }
      }
    } else {
      const userVar =
        (typeof (credVars as { usernameVariable?: unknown } | undefined)?.usernameVariable ===
          'string' &&
          (credVars as { usernameVariable: string }).usernameVariable.trim()) ||
        (typeof projectWithCreds.credentials?.usernameVariable === 'string' &&
          projectWithCreds.credentials.usernameVariable.trim()) ||
        defaultUser;

      const passVar =
        (typeof (credVars as { passwordVariable?: unknown } | undefined)?.passwordVariable ===
          'string' &&
          (credVars as { passwordVariable: string }).passwordVariable.trim()) ||
        (typeof projectWithCreds.credentials?.passwordVariable === 'string' &&
          projectWithCreds.credentials.passwordVariable.trim()) ||
        defaultPass;

      if (userVar && userVar.length > 0) keys.add(userVar);
      if (passVar && passVar.length > 0) keys.add(passVar);
    }
  }

  return Array.from(keys).sort();
}
