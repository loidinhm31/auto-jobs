import type { IncomingMessage, ServerResponse } from 'node:http';

import { MAX_CONTROL_BODY_BYTES } from './report-server-constants.js';
import { writeControlSecurityHeaders } from './report-server-control-security.js';

export function sendJson(response: ServerResponse, status: number, data: unknown): void {
  writeControlSecurityHeaders(response);
  const json = JSON.stringify(data);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
  });
  response.end(json);
}

export function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  issues?: readonly string[],
): void {
  sendJson(response, status, {
    error: {
      code,
      message,
      ...(issues !== undefined && issues.length > 0 ? { issues } : {}),
    },
  });
}

export async function readBoundedJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_CONTROL_BODY_BYTES,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; message: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;

    const onData = (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.byteLength;
      if (total > maxBytes) {
        aborted = true;
        cleanup();
        request.destroy();
        resolve({ ok: false, status: 413, message: `request body exceeded ${maxBytes} bytes limit` });
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      if (aborted) return;
      cleanup();
      const bodyText = Buffer.concat(chunks).toString('utf8');
      try {
        const parsed: unknown = JSON.parse(bodyText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          resolve({ ok: false, status: 400, message: 'request body must be a JSON object' });
          return;
        }
        resolve({ ok: true, data: parsed as Record<string, unknown> });
      } catch {
        resolve({ ok: false, status: 400, message: 'malformed JSON request body' });
      }
    };

    const onError = () => {
      if (aborted) return;
      aborted = true;
      cleanup();
      resolve({ ok: false, status: 400, message: 'error reading request body' });
    };

    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
    };

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
  });
}
