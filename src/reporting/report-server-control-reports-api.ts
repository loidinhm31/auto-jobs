import type { IncomingMessage, ServerResponse } from 'node:http';

import { validateMutationRequest } from './report-server-control-security.js';
import { sendError, sendJson, readBoundedJsonBody } from './report-server-json.js';
import type { ControlRouterContext } from './report-server-control.js';
import { SAFE_ID } from '../artifacts/artifact-identity.js';
import {
  assertSafeProjectId,
  deleteProjectReports,
  ProjectDeletionError,
} from '../artifacts/report-project-deletion.js';
import {
  assertSafeRunId,
  deleteProjectRunReport,
  RunDeletionError,
} from '../artifacts/report-run-deletion.js';

const PROJECT_ROUTE_PREFIX = '/api/reports/projects/';

function parseSegment(
  segment: string,
  errorName: 'INVALID_PROJECT_ID' | 'INVALID_RUN_ID',
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  if (segment.length === 0) return { ok: false, code: errorName, message: 'empty identifier' };
  if (segment.includes('%25')) return { ok: false, code: errorName, message: 'double-encoded identifier' };
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return { ok: false, code: errorName, message: 'malformed percent-encoding' };
  }
  if (decoded.includes('/') || decoded.includes('\\')) return { ok: false, code: errorName, message: 'contains path separators' };
  if (decoded.includes('\0')) return { ok: false, code: errorName, message: 'contains null bytes' };
  if (decoded === '.' || decoded === '..' || decoded.includes('..')) return { ok: false, code: errorName, message: 'contains path traversal' };
  if (!SAFE_ID.test(decoded)) return { ok: false, code: errorName, message: 'identifier is invalid' };
  return { ok: true, value: decoded };
}

export async function handleControlReportsApi(
  context: ControlRouterContext,
  pathname: string,
  method: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (pathname === '/api/reports' || pathname === '/api/reports/' || pathname === '/api/reports/projects' || pathname === PROJECT_ROUTE_PREFIX) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'missing project id in path');
    return;
  }
  if (!pathname.startsWith(PROJECT_ROUTE_PREFIX)) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'invalid project route');
    return;
  }

  const rawSegment = pathname.slice(PROJECT_ROUTE_PREFIX.length);
  if (rawSegment.length === 0) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'empty project id');
    return;
  }

  let rawProjectId: string;
  let rawRunId: string | undefined;

  const runsIdx = rawSegment.indexOf('/runs/');
  if (runsIdx !== -1) {
    rawProjectId = rawSegment.slice(0, runsIdx);
    rawRunId = rawSegment.slice(runsIdx + '/runs/'.length);
    if (rawProjectId.includes('/') || rawRunId.includes('/')) {
      sendError(response, 400, 'INVALID_RUN_ID', 'run route contains unexpected path segments');
      return;
    }
  } else if (rawSegment.includes('/runs')) {
    sendError(response, 400, 'INVALID_RUN_ID', 'missing run id in path');
    return;
  } else if (rawSegment.includes('/')) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project route must contain exactly one segment');
    return;
  } else {
    rawProjectId = rawSegment;
  }

  const projectParsed = parseSegment(rawProjectId, 'INVALID_PROJECT_ID');
  if (!projectParsed.ok) {
    sendError(response, 400, projectParsed.code, projectParsed.message);
    return;
  }
  try {
    assertSafeProjectId(projectParsed.value);
  } catch (error) {
    if (error instanceof ProjectDeletionError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project id is invalid');
    return;
  }

  let validatedRunId: string | undefined;
  if (rawRunId !== undefined) {
    const runParsed = parseSegment(rawRunId, 'INVALID_RUN_ID');
    if (!runParsed.ok) {
      sendError(response, 400, runParsed.code, runParsed.message);
      return;
    }
    try {
      assertSafeRunId(runParsed.value);
      validatedRunId = runParsed.value;
    } catch (error) {
      if (error instanceof RunDeletionError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      sendError(response, 400, 'INVALID_RUN_ID', 'run id is invalid');
      return;
    }
  }

  if (method !== 'DELETE') {
    response.setHeader('allow', 'DELETE');
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'method not allowed for reports endpoint');
    return;
  }

  const mutation = validateMutationRequest(request, context.host, context.port, context.csrfToken);
  if (!mutation.valid) {
    sendError(response, mutation.status, 'FORBIDDEN_MUTATION', mutation.message);
    return;
  }
  if (request.headers['transfer-encoding'] !== undefined && request.headers['content-type'] === undefined) {
    sendError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return;
  }

  const hasBody = request.headers['transfer-encoding'] !== undefined ||
    (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') ||
    request.headers['content-type'] !== undefined;

  if (hasBody) {
    const bodyResult = await readBoundedJsonBody(request);
    if (!bodyResult.ok) {
      sendError(response, bodyResult.status, 'INVALID_BODY', bodyResult.message);
      return;
    }
    if (Object.keys(bodyResult.data).length > 0) {
      sendError(response, 400, 'INVALID_BODY', 'DELETE payload must be empty');
      return;
    }
  }

  try {
    if (validatedRunId !== undefined) {
      const result = await deleteProjectRunReport(context.reportRoot, projectParsed.value, validatedRunId);
      sendJson(response, 200, result);
    } else {
      const result = await deleteProjectReports(context.reportRoot, projectParsed.value);
      sendJson(response, 200, result);
    }
  } catch (error) {
    if (error instanceof ProjectDeletionError || error instanceof RunDeletionError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(response, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'failed to delete report');
  }
}
