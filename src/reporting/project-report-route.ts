import { SAFE_ID } from '../artifacts/artifact-identity.js';

export interface ProjectReportRouteMatch {
  readonly projectId: string;
  readonly runId: string;
  readonly isIndexHtml: boolean;
  readonly isDirectory: boolean;
  readonly canonicalPath: string;
}
const RESERVED_SEGMENTS: Readonly<Record<string, true>> = {
  assets: true,
  'index.html': true,
  api: true,
};

function parseAndValidateId(rawSegment: string): string | undefined {
  if (
    rawSegment.length === 0 ||
    rawSegment === '.' ||
    rawSegment === '..' ||
    rawSegment.startsWith('.') ||
    rawSegment.includes('..') ||
    RESERVED_SEGMENTS[rawSegment.toLowerCase()] === true ||
    rawSegment.includes('%25')
  ) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    return undefined;
  }
  if (
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    decoded === '.' ||
    decoded === '..' ||
    decoded.includes('..') ||
    decoded.startsWith('.') ||
    RESERVED_SEGMENTS[decoded.toLowerCase()] === true ||
    !SAFE_ID.test(decoded)
  ) {
    return undefined;
  }
  return decoded;
}

export function parseProjectReportRoute(target: string | undefined): ProjectReportRouteMatch | undefined {
  if (typeof target !== 'string' || target.length === 0) {
    return undefined;
  }

  const queryStart = target.indexOf('?');
  const withoutQuery = queryStart < 0 ? target : target.slice(0, queryStart);
  const hashStart = withoutQuery.indexOf('#');
  const rawPath = hashStart < 0 ? withoutQuery : withoutQuery.slice(0, hashStart);

  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) {
    return undefined;
  }

  // Reject raw or encoded path separators, null bytes, backslashes, and double encoding in raw path
  const lowerRaw = rawPath.toLowerCase();
  if (
    lowerRaw.includes('%2f') ||
    lowerRaw.includes('%5c') ||
    lowerRaw.includes('%00') ||
    lowerRaw.includes('%25') ||
    rawPath.includes('\\') ||
    rawPath.includes('\0')
  ) {
    return undefined;
  }

  const segments = rawPath.split('/');
  // Expected formats:
  // ['', 'reports', rawProject, rawRun, 'index.html'] -> length 5, index.html
  // ['', 'reports', rawProject, rawRun, '']           -> length 5, directory
  // ['', 'reports', rawProject, rawRun]               -> length 4, directory
  if (segments.length !== 4 && segments.length !== 5) {
    return undefined;
  }

  if (segments[0] !== '' || segments[1] !== 'reports') {
    return undefined;
  }

  const rawProject = segments[2];
  const rawRun = segments[3];
  if (!rawProject || !rawRun) {
    return undefined;
  }

  let isIndexHtml = false;
  let isDirectory = false;

  if (segments.length === 5) {
    const last = segments[4];
    if (last === 'index.html') {
      isIndexHtml = true;
    } else if (last === '') {
      isDirectory = true;
    } else {
      return undefined;
    }
  } else {
    // length === 4
    isDirectory = true;
  }

  const projectId = parseAndValidateId(rawProject);
  if (projectId === undefined) {
    return undefined;
  }

  const runId = parseAndValidateId(rawRun);
  if (runId === undefined) {
    return undefined;
  }

  return {
    projectId,
    runId,
    isIndexHtml,
    isDirectory,
    canonicalPath: `/reports/${projectId}/${runId}/index.html`,
  };
}

export function isFinalProjectReportPath(target: string | undefined): boolean {
  const match = parseProjectReportRoute(target);
  return match !== undefined && match.isIndexHtml;
}

export function toCanonicalProjectReportPath(projectId: string, runId: string): string {
  return `/reports/${projectId}/${runId}/index.html`;
}
