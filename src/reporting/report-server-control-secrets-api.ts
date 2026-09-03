import type { IncomingMessage, ServerResponse } from 'node:http';

import { validateMutationRequest } from './report-server-control-security.js';
import { sendError, sendJson, readBoundedJsonBody } from './report-server-json.js';
import type { ControlRouterContext } from './report-server-control.js';
import { isValidSecretKey } from './report-server-secret-store.js';

function buildPresenceMap(secrets: Readonly<Record<string, string>>): Record<string, boolean> {
  const presence: Record<string, boolean> = {};
  for (const key of Object.keys(secrets).sort()) {
    presence[key] = true;
  }
  return presence;
}

export async function handleSecretsApi(
  context: ControlRouterContext,
  searchParams: URLSearchParams,
  method: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!context.secretStore) {
    sendError(response, 503, 'SERVICE_UNAVAILABLE', 'secret store is not configured');
    return;
  }

  if (method === 'GET') {
    try {
      const secrets = await context.secretStore.readSecrets();
      const keysParam = searchParams.get('keys');
      if (keysParam !== null) {
        const presence: Record<string, boolean> = {};
        const requested = keysParam.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
        for (const key of requested) {
          if (!isValidSecretKey(key)) {
            sendError(response, 400, 'INVALID_KEY', `invalid secret key name: '${key}'`);
            return;
          }
          presence[key] = Object.prototype.hasOwnProperty.call(secrets, key);
        }
        sendJson(response, 200, { secrets: presence });
        return;
      }
      sendJson(response, 200, { secrets: buildPresenceMap(secrets) });
    } catch (err) {
      sendError(response, 500, 'SECRET_READ_ERROR', err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (method === 'PUT') {
    const gate = validateMutationRequest(request, context.host, context.port, context.csrfToken);
    if (!gate.valid) {
      const code = gate.status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'FORBIDDEN';
      sendError(response, gate.status, code, gate.message);
      return;
    }
    const bodyResult = await readBoundedJsonBody(request);
    if (!bodyResult.ok) {
      sendError(response, bodyResult.status, 'INVALID_BODY', bodyResult.message);
      return;
    }
    const data = bodyResult.data;
    const toPut: Record<string, string> = {};
    const toDelete: string[] = [];

    if ('secrets' in data) {
      if (typeof data['secrets'] !== 'object' || data['secrets'] === null || Array.isArray(data['secrets'])) {
        sendError(response, 400, 'MALFORMED_REQUEST', '"secrets" must be an object');
        return;
      }
      const entries = Object.entries(data['secrets'] as Record<string, unknown>);
      if (entries.length === 0) {
        sendError(response, 400, 'MALFORMED_REQUEST', '"secrets" object cannot be empty');
        return;
      }
      for (const [key, val] of entries) {
        if (!isValidSecretKey(key)) {
          sendError(response, 400, 'INVALID_KEY', `invalid secret key name: '${key}'`);
          return;
        }
        if (val === null) {
          toDelete.push(key);
        } else if (typeof val === 'string') {
          toPut[key] = val;
        } else {
          sendError(response, 400, 'INVALID_SECRET_VALUE', `secret value for key '${key}' must be a string or null`);
          return;
        }
      }
    } else if ('name' in data) {
      if (typeof data['name'] !== 'string' || !isValidSecretKey(data['name'])) {
        sendError(response, 400, 'INVALID_KEY', `invalid secret key name: '${String(data['name'])}'`);
        return;
      }
      if (data['value'] === null || data['action'] === 'delete') {
        toDelete.push(data['name']);
      } else if (typeof data['value'] === 'string') {
        toPut[data['name']] = data['value'];
      } else {
        sendError(response, 400, 'INVALID_SECRET_VALUE', `secret value for key '${data['name']}' must be a string`);
        return;
      }
    } else {
      sendError(response, 400, 'MALFORMED_REQUEST', 'request body must contain "secrets" object or "name" string');
      return;
    }

    try {
      if (toDelete.length > 0) await context.secretStore.deleteSecrets(toDelete);
      if (Object.keys(toPut).length > 0) await context.secretStore.putSecrets(toPut);
      const secrets = await context.secretStore.readSecrets();
      sendJson(response, 200, { secrets: buildPresenceMap(secrets) });
    } catch (err) {
      sendError(response, 500, 'SECRET_WRITE_ERROR', err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (method === 'DELETE') {
    const gate = validateMutationRequest(request, context.host, context.port, context.csrfToken);
    if (!gate.valid) {
      const code = gate.status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'FORBIDDEN';
      sendError(response, gate.status, code, gate.message);
      return;
    }
    const nameParam = searchParams.get('name');
    const toDelete: string[] = [];
    if (nameParam !== null) {
      if (!isValidSecretKey(nameParam)) {
        sendError(response, 400, 'INVALID_KEY', `invalid secret key name: '${nameParam}'`);
        return;
      }
      toDelete.push(nameParam);
    } else {
      const bodyResult = await readBoundedJsonBody(request);
      if (!bodyResult.ok) {
        sendError(response, bodyResult.status, 'INVALID_BODY', bodyResult.message);
        return;
      }
      const data = bodyResult.data;
      if (typeof data['name'] === 'string') {
        if (!isValidSecretKey(data['name'])) {
          sendError(response, 400, 'INVALID_KEY', `invalid secret key name: '${data['name']}'`);
          return;
        }
        toDelete.push(data['name']);
      } else if (Array.isArray(data['names'])) {
        if (data['names'].length === 0) {
          sendError(response, 400, 'MALFORMED_REQUEST', '"names" array cannot be empty');
          return;
        }
        for (const name of data['names']) {
          if (typeof name !== 'string' || !isValidSecretKey(name)) {
            sendError(response, 400, 'INVALID_KEY', `invalid secret key name: '${String(name)}'`);
            return;
          }
          toDelete.push(name);
        }
      } else {
        sendError(response, 400, 'MALFORMED_REQUEST', 'DELETE requires name parameter or JSON body with name or names');
        return;
      }
    }

    try {
      await context.secretStore.deleteSecrets(toDelete);
      const secrets = await context.secretStore.readSecrets();
      sendJson(response, 200, { secrets: buildPresenceMap(secrets) });
    } catch (err) {
      sendError(response, 500, 'SECRET_WRITE_ERROR', err instanceof Error ? err.message : String(err));
    }
    return;
  }

  response.setHeader('allow', 'GET, PUT, DELETE');
  sendError(response, 405, 'METHOD_NOT_ALLOWED', 'method not allowed for /api/secrets');
}
