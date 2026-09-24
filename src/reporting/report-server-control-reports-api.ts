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

const PROJECT_ROUTE_PREFIX = '/api/reports/projects/';

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

  if (rawSegment.includes('/')) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project route must contain exactly one segment');
    return;
  }

  if (rawSegment.includes('%25')) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'double-encoded project id');
    return;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'malformed percent-encoding in project id');
    return;
  }

  if (decoded.includes('/') || decoded.includes('\\')) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project id contains path separators');
    return;
  }

  if (decoded.includes('\0')) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project id contains null bytes');
    return;
  }

  if (decoded === '.' || decoded === '..' || decoded.includes('..')) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project id contains path traversal');
    return;
  }

  if (!SAFE_ID.test(decoded)) {
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project id is invalid');
    return;
  }

  try {
    assertSafeProjectId(decoded);
  } catch (error) {
    if (error instanceof ProjectDeletionError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(response, 400, 'INVALID_PROJECT_ID', 'project id is invalid');
    return;
  }

  if (method !== 'DELETE') {
    response.setHeader('allow', 'DELETE');
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'method not allowed for project reports endpoint');
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
    const result = await deleteProjectReports(context.reportRoot, decoded);
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof ProjectDeletionError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(response, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'failed to delete project reports');
  }
}
