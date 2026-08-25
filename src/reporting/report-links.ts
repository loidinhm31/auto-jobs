import { assertSafeReferenceUrl } from '../security/url-policy.js';

const SAFE_LOCAL_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const SAFE_LOCAL_ANCHOR = /^#[a-z0-9][a-z0-9-]{0,127}$/u;

function safeLocalPath(value: string): string | undefined {
  if (value.length === 0 || value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f\u007f?#]/u.test(value)) {
    return undefined;
  }
  const segments = value.split('/');
  return segments.every((segment) => SAFE_LOCAL_SEGMENT.test(segment)) ? segments.join('/') : undefined;
}

export function localAnchorHref(value: string): string | undefined {
  return SAFE_LOCAL_ANCHOR.test(value) ? value : undefined;
}

export function safeExternalHref(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return assertSafeReferenceUrl(value, 'report source URL');
  } catch {
    return undefined;
  }
}

export function localArtifactHref(
  value: string | undefined,
  availableArtifacts: readonly string[],
): string | undefined {
  if (value === undefined || !availableArtifacts.includes(value)) return undefined;
  return safeLocalPath(value);
}

export function localReportHref(value: string | undefined): string | undefined {
  return value === undefined || !value.endsWith('/index.html') ? undefined : safeLocalPath(value);
}

export function localManifestHref(value: string | undefined): string | undefined {
  return value === undefined || !value.endsWith('/manifest.json') ? undefined : safeLocalPath(value);
}
