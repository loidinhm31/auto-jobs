import type { IncomingMessage, ServerResponse } from 'node:http';
import * as path from 'node:path';

import { handleReportRequest } from './report-server-files.js';
import { assertReportRoot, type ReportRootReference } from './report-server-file-io.js';
import {
  writeControlSecurityHeaders,
  validateHostHeader,
} from './report-server-control-security.js';
import { sendError, sendJson } from './report-server-json.js';
import type { ConfigStore } from './report-server-config-store.js';
import type { SecretStore } from './report-server-secret-store.js';
import type { RunManager } from './report-server-run-manager.js';
import { getControlCss, getControlJs, renderControlPageHtml } from './report-server-control-page.js';
import { handleConfigApi, handleRunApi, handleSecretsApi } from './report-server-control-api.js';

export interface ControlRouterContext {
  readonly configStore: ConfigStore;
  readonly secretStore?: SecretStore;
  readonly runManager: RunManager;
  readonly reportRoot: string;
  readonly host: string;
  readonly port: number;
  readonly csrfToken: string;
}

let cachedReportRootRef: ReportRootReference | undefined;

async function getReportRootRef(reportRoot: string): Promise<ReportRootReference | undefined> {
  try {
    if (cachedReportRootRef === undefined || cachedReportRootRef.path !== path.resolve(reportRoot)) {
      cachedReportRootRef = await assertReportRoot(reportRoot);
    }
    return cachedReportRootRef;
  } catch {
    return undefined;
  }
}

export async function handleControlRequest(
  context: ControlRouterContext,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = request.url ?? '/';
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex < 0 ? url : url.slice(0, queryIndex);
  const searchParams = new URLSearchParams(queryIndex < 0 ? '' : url.slice(queryIndex));

  if (!validateHostHeader(request, context.host, context.port)) {
    sendError(response, 403, 'FORBIDDEN_HOST', 'invalid Host header');
    return;
  }

  // Exact UI and Asset Routes
  if (method === 'GET' && pathname === '/') {
    writeControlSecurityHeaders(response);
    const html = await renderControlPageHtml(context.csrfToken);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(html),
    });
    response.end(html);
    return;
  }

  if (method === 'GET' && pathname === '/assets/control-page.css') {
    writeControlSecurityHeaders(response);
    const css = await getControlCss();
    response.writeHead(200, {
      'content-type': 'text/css; charset=utf-8',
      'content-length': Buffer.byteLength(css),
    });
    response.end(css);
    return;
  }

  if (method === 'GET' && pathname === '/assets/control-page.js') {
    writeControlSecurityHeaders(response);
    const js = await getControlJs();
    response.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'content-length': Buffer.byteLength(js),
    });
    response.end(js);
    return;
  }

  // Reports sub-tree
  if (pathname.startsWith('/reports/')) {
    const reportRef = await getReportRootRef(context.reportRoot);
    if (reportRef === undefined) {
      writeControlSecurityHeaders(response);
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('report file not found\n');
      return;
    }
    const reportRelativeUrl = url.slice('/reports'.length);
    const subRequest = Object.create(request, {
      url: { value: reportRelativeUrl },
    }) as IncomingMessage;
    await handleReportRequest(reportRef.path, subRequest, response, reportRef.identity);
    return;
  }

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    await handleApiRequest(context, pathname, searchParams, method, request, response);
    return;
  }

  // Default deny
  writeControlSecurityHeaders(response);
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found\n');
}

async function handleApiRequest(
  context: ControlRouterContext,
  pathname: string,
  searchParams: URLSearchParams,
  method: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (pathname === '/api/configs' && method === 'GET') {
    const configs = await context.configStore.listConfigs();
    sendJson(response, 200, { configs });
    return;
  }

  if (pathname === '/api/config') {
    await handleConfigApi(context, searchParams, method, request, response);
    return;
  }

  if (pathname === '/api/run') {
    await handleRunApi(context, searchParams, method, request, response);
    return;
  }

  if (pathname === '/api/secrets') {
    await handleSecretsApi(context, searchParams, method, request, response);
    return;
  }

  sendError(response, 404, 'NOT_FOUND', 'API endpoint not found');
}
