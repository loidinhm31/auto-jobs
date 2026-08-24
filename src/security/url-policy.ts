import { ConfigError } from '../config-errors.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
const TRAVERSAL_SEGMENT = /(?:^|\/)(?:\.{1,2})(?:\/|$)/u;
const SENSITIVE_QUERY_KEY = /(?:auth(?:entication|orization)?|pass(?:word|phrase)?|token|secret|cookie|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|session(?:id)?)/iu;
const SENSITIVE_QUERY_ASSIGNMENT = /(?:^|[\s&;,?])(?:auth(?:entication|orization)?|pass(?:word|phrase)?|token|secret|cookie|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|session(?:id)?)\s*=/iu;

function rawPath(value: string): string {
  const authority = /^[a-z][a-z\d+.-]*:\/\/[^/?#\\]*/iu.exec(value)?.[0] ?? '';
  return value.slice(authority.length).split(/[?#]/u, 1)[0] ?? '';
}

function hasTraversal(value: string): boolean {
  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (TRAVERSAL_SEGMENT.test(decoded.replaceAll('\\', '/'))) {
      return true;
    }
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return false;
      }
      decoded = next;
    } catch {
      return true;
    }
  }
  return true;
}

function hasCredentialLikeQueryValue(value: string): boolean {
  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (SENSITIVE_QUERY_ASSIGNMENT.test(decoded)) {
      return true;
    }
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return false;
      }
      decoded = next;
    } catch {
      return true;
    }
  }
  return true;
}

function hasCredentialLikeQueryKey(key: string): boolean {
  let decoded = key;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (SENSITIVE_QUERY_KEY.test(decoded)) {
      return true;
    }
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return false;
      }
      decoded = next;
    } catch {
      return true;
    }
  }
  return true;
}

function assertHttpUrl(value: string, fieldName: string): URL {
  const input = value.trim();
  if (input.length === 0 || CONTROL_CHARS.test(input)) {
    throw new ConfigError([`${fieldName} must be a non-empty URL`]);
  }
  if (hasTraversal(rawPath(input))) {
    throw new ConfigError([`${fieldName} must not contain traversal segments`]);
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ConfigError([`${fieldName} must be an absolute URL`]);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError([`${fieldName} must use http or https`]);
  }
  if (url.username || url.password) {
    throw new ConfigError([`${fieldName} must not contain credentials`]);
  }
  for (const [key, value] of url.searchParams) {
    if (hasCredentialLikeQueryKey(key) || hasCredentialLikeQueryValue(value)) {
      throw new ConfigError([`${fieldName} must not contain credential-like query values`]);
    }
  }
  if (hasTraversal(url.pathname)) {
    throw new ConfigError([`${fieldName} must not contain traversal segments`]);
  }
  return url;
}

export function containsPathTraversal(value: string): boolean {
  return hasTraversal(value);
}

export function canonicalizeBaseUrl(value: string, fieldName = 'baseUrl'): string {
  const url = assertHttpUrl(value, fieldName);
  if (url.search || url.hash) {
    throw new ConfigError([`${fieldName} must not contain query or fragment`]);
  }
  url.pathname = url.pathname.replace(/\/+$/u, '');
  return url.toString().replace(/\/$/u, '');
}

export function canonicalizeOrigin(value: string, fieldName = 'origin'): string {
  const url = assertHttpUrl(value, fieldName);
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new ConfigError([`${fieldName} must be an origin without a path`]);
  }
  return url.origin;
}

function normalizedPath(value: string): string {
  const path = new URL(value).pathname.replace(/\/+$/u, '');
  return path === '/' ? '' : path;
}

export function isWithinBasePath(candidate: string, baseUrl: string): boolean {
  const candidateUrl = assertHttpUrl(candidate, 'candidate URL');
  const canonicalBase = canonicalizeBaseUrl(baseUrl);
  const base = new URL(canonicalBase);
  if (candidateUrl.origin !== base.origin || hasTraversal(candidateUrl.pathname)) {
    return false;
  }
  const basePath = normalizedPath(canonicalBase);
  const candidatePath = normalizedPath(candidate);
  return (
    basePath.length === 0 ||
    candidatePath === basePath ||
    candidatePath.startsWith(`${basePath}/`)
  );
}

export function assertSameOrigin(
  value: string,
  expected: string,
  fieldName = 'URL',
): string {
  const url = assertHttpUrl(value, fieldName);
  const expectedUrl = assertHttpUrl(expected, 'expected URL');
  if (url.origin !== expectedUrl.origin) {
    throw new ConfigError([`${fieldName} is outside the expected origin`]);
  }
  return url.toString();
}

export function assertAllowedUrl(
  value: string,
  baseUrl: string,
  allowedOrigins: readonly string[] = [],
  fieldName = 'URL',
): string {
  const url = assertHttpUrl(value, fieldName);
  const canonicalBase = canonicalizeBaseUrl(baseUrl);
  if (isWithinBasePath(url.toString(), canonicalBase)) {
    return url.toString();
  }
  if (url.origin === new URL(canonicalBase).origin) {
    throw new ConfigError([`${fieldName} escapes the configured base context`]);
  }
  const allowed = new Set(
    allowedOrigins.map((origin, index) =>
      canonicalizeOrigin(origin, `${fieldName} allowed origin ${index + 1}`),
    ),
  );
  if (!allowed.has(url.origin)) {
    throw new ConfigError([`${fieldName} is outside the configured origins`]);
  }
  return url.toString();
}

export function assertSafeReferenceUrl(value: string, fieldName = 'reference URL'): string {
  const url = assertHttpUrl(value, fieldName);
  url.hash = '';
  return url.toString();
}

export function isSafeReferenceUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    assertSafeReferenceUrl(value);
    return true;
  } catch {
    return false;
  }
}
