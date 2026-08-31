import type { IncomingMessage, ServerResponse } from 'node:http';
import * as path from 'node:path';

import { REPORT_CSP } from './report-server-constants.js';
import { openReportFile, readBounded, type ReportRootIdentity } from './report-server-file-io.js';

function unsafeSegment(segment: string): boolean {
  if (segment === '.' || segment === '..' || segment.startsWith('.') || (process.platform === 'win32' && segment.includes(':'))) return true;
  try {
    const twiceDecoded = decodeURIComponent(segment);
    return twiceDecoded === '.' || twiceDecoded === '..' || twiceDecoded.startsWith('.') || twiceDecoded.includes('\\');
  } catch {
    return false;
  }
}

export function decodeRequestPath(requestTarget: string | undefined): string | undefined {
  const rawTarget = requestTarget ?? '/';
  const queryStart = rawTarget.indexOf('?');
  const rawPath = queryStart < 0 ? rawTarget : rawTarget.slice(0, queryStart);
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.split('/').some((segment) => segment === '.' || segment === '..')) return undefined;
  try {
    const decoded = decodeURIComponent(rawPath);
    if (decoded.includes('\u0000') || decoded.includes('\\')) return undefined;
    if (decoded.split('/').some(unsafeSegment)) return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

function contentType(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function respond(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'content-security-policy': REPORT_CSP,
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

export async function handleReportRequest(root: string, request: IncomingMessage, response: ServerResponse, expectedRootIdentity?: ReportRootIdentity): Promise<void> {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    request.resume();
    response.setHeader('allow', 'GET, HEAD');
    respond(response, 405, 'method not allowed\n');
    return;
  }
  const decodedPath = decodeRequestPath(request.url);
  if (decodedPath === undefined) {
    respond(response, 400, 'invalid report path\n');
    return;
  }
  const file = await openReportFile(root, decodedPath, expectedRootIdentity);
  if (file === undefined) {
    respond(response, 404, 'report file not found\n');
    return;
  }
  try {
    const body = method === 'GET' ? await readBounded(file) : undefined;
    response.writeHead(200, {
      'content-type': contentType(file.filename),
      'content-length': file.size,
      'cache-control': 'no-store',
      'content-security-policy': REPORT_CSP,
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch {
    if (!response.headersSent) respond(response, 409, 'report file changed; retry the request\n');
    else response.destroy();
  } finally {
    await file.handle.close().catch(() => undefined);
  }
}
