import type { IncomingMessage, ServerResponse } from 'node:http';

import { validateMutationRequest } from './report-server-control-security.js';
import { sendError, sendJson, readBoundedJsonBody } from './report-server-json.js';
import type { ControlRouterContext } from './report-server-control.js';

export async function handleConfigApi(
  context: ControlRouterContext,
  searchParams: URLSearchParams,
  method: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const name = searchParams.get('name');
  if (!name) {
    sendError(response, 400, 'INVALID_QUERY', 'name query parameter is required');
    return;
  }

  if (method === 'GET') {
    try {
      const entry = await context.configStore.readConfig(name);
      sendJson(response, 200, entry);
    } catch (err) {
      sendError(response, 404, 'CONFIG_NOT_FOUND', err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (method === 'PUT') {
    const gate = validateMutationRequest(request, context.host, context.port, context.csrfToken);
    if (!gate.valid) {
      sendError(response, gate.status, 'FORBIDDEN', gate.message);
      return;
    }
    const ifMatch = request.headers['if-match'];
    if (typeof ifMatch !== 'string' || ifMatch.trim().length === 0) {
      sendError(response, 428, 'PRECONDITION_REQUIRED', 'If-Match header is required for updates');
      return;
    }
    const bodyResult = await readBoundedJsonBody(request);
    if (!bodyResult.ok) {
      sendError(response, bodyResult.status, 'INVALID_BODY', bodyResult.message);
      return;
    }
    try {
      const updated = await context.configStore.writeConfig(name, bodyResult.data, ifMatch);
      sendJson(response, 200, updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ETag precondition failed')) {
        sendError(response, 409, 'CONFLICT', msg);
      } else if (msg.includes('not found')) {
        sendError(response, 404, 'CONFIG_NOT_FOUND', msg);
      } else {
        sendError(response, 422, 'SCHEMA_ERROR', msg);
      }
    }
    return;
  }

  sendError(response, 405, 'METHOD_NOT_ALLOWED', 'method not allowed for /api/config');
}

export async function handleRunApi(
  context: ControlRouterContext,
  searchParams: URLSearchParams,
  method: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (method === 'POST') {
    const gate = validateMutationRequest(request, context.host, context.port, context.csrfToken);
    if (!gate.valid) {
      sendError(response, gate.status, 'FORBIDDEN', gate.message);
      return;
    }
    const bodyResult = await readBoundedJsonBody(request);
    if (!bodyResult.ok) {
      sendError(response, bodyResult.status, 'INVALID_BODY', bodyResult.message);
      return;
    }
    const data = bodyResult.data;
    if (typeof data['configName'] !== 'string' || typeof data['configEtag'] !== 'string' || typeof data['runType'] !== 'string') {
      sendError(response, 400, 'MALFORMED_REQUEST', 'configName, configEtag, and runType are required');
      return;
    }
    const runType = data['runType'];
    if (runType !== 'report' && runType !== 'auto-build') {
      sendError(response, 422, 'INVALID_RUN_TYPE', 'runType must be report or auto-build');
      return;
    }
    const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : undefined;
    if (runType === 'auto-build' && (projectId === undefined || projectId.trim().length === 0)) {
      sendError(response, 422, 'MISSING_PROJECT_ID', 'projectId is required for auto-build');
      return;
    }

    try {
      const record = await context.runManager.startRun({
        configName: data['configName'],
        configEtag: data['configEtag'],
        runType: runType as 'report' | 'auto-build',
        projectId,
      });
      sendJson(response, 202, { id: record.id, status: record.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already in progress')) {
        sendError(response, 409, 'ACTIVE_RUN_CONFLICT', msg);
      } else {
        sendError(response, 422, 'UNPROCESSABLE_RUN', msg);
      }
    }
    return;
  }

  if (method === 'GET') {
    const id = searchParams.get('id');
    if (!id) {
      sendError(response, 400, 'INVALID_QUERY', 'id query parameter is required');
      return;
    }
    const run = context.runManager.getRun(id);
    if (!run) {
      sendError(response, 404, 'RUN_NOT_FOUND', `run '${id}' not found`);
      return;
    }
    sendJson(response, 200, { run });
    return;
  }

  sendError(response, 405, 'METHOD_NOT_ALLOWED', 'method not allowed for /api/run');
}
