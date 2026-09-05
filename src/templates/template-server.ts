import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP, type Socket } from 'node:net';

import { isExactFixtureUrl } from './template-fixture-html.js';
import { loadTemplateReportFixture } from './template-fixture-loader.js';
import { templateResponse } from './template-fixture-routes.js';
import type { TemplateReportFixture } from './template-fixture-types.js';

const SHUTDOWN_GRACE_MS = 2_000;

export interface TemplateServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly allowLan?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface TemplateServerHandle {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly fixture: TemplateReportFixture;
  readonly close: () => Promise<void>;
  readonly resetAuthState: () => void;
}

interface TemplateServerState {
  sonarqubeAuthenticated: boolean;
}

function validateHost(host: string): string {
  if (host.length === 0 || host.length > 255 || /[\u0000-\u0020\u007f]/u.test(host)) {
    throw new Error('Template server host must be a non-empty host without whitespace or control characters');
  }
  return host;
}

function validatePort(port: number): number {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Template server port must be between 0 and 65535');
  }
  return port;
}

export function isLoopbackHost(host: string): boolean {
  const clean = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return clean.toLowerCase() === 'localhost' || clean === '::1' || (isIP(clean) === 4 && clean.startsWith('127.'));
}

function handleTemplateRequest(
  request: IncomingMessage,
  response: ServerResponse,
  fixture: TemplateReportFixture,
  origin: string,
  state: TemplateServerState,
): void {
  const method = request.method ?? 'GET';
  if (!['GET', 'HEAD', 'POST'].includes(method)) {
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Method Not Allowed\n');
    return;
  }

  const rawTarget = request.url ?? '/';
  const queryStart = rawTarget.indexOf('?');
  const rawPath = queryStart < 0 ? rawTarget : rawTarget.slice(0, queryStart);
  try {
    const decodedPath = decodeURIComponent(rawPath);
    if (decodedPath.includes('\u0000')) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad Request\n');
      return;
    }
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad Request\n');
    return;
  }

  let url: URL;
  try {
    url = new URL(rawTarget, origin);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad Request\n');
    return;
  }

  if (url.origin !== origin) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found\n');
    return;
  }

  if (method === 'POST') {
    if (isExactFixtureUrl(url, fixture.loginActionUrl) || url.pathname === '/j_spring_security_check') {
      response.writeHead(302, {
        Location: fixture.jobUrl,
        'Cache-Control': 'no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'text/plain; charset=utf-8',
      }).end(`Redirecting to ${fixture.jobUrl}\n`);
      return;
    }

    if (
      isExactFixtureUrl(url, fixture.sonarqubeLoginActionUrl) ||
      isExactFixtureUrl(url, fixture.sonarqubeLoginUrl) ||
      url.pathname === '/sessions/new'
    ) {
      state.sonarqubeAuthenticated = true;
      response.writeHead(302, {
        Location: fixture.sonarqubeHomeUrl,
        'Cache-Control': 'no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'text/plain; charset=utf-8',
      }).end(`Redirecting to ${fixture.sonarqubeHomeUrl}\n`);
      return;
    }

    if (isExactFixtureUrl(url, fixture.buildActionUrl)) {
      response.writeHead(302, {
        Location: fixture.jobUrl,
        'Cache-Control': 'no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'text/plain; charset=utf-8',
      }).end(`Redirecting to ${fixture.jobUrl}\n`);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found\n');
    return;
  }

  // Guard SonarQube home: unauthenticated users see the login page
  if (isExactFixtureUrl(url, fixture.sonarqubeHomeUrl) && !state.sonarqubeAuthenticated) {
    const body = fixture.sonarqubeLoginHtml;
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body, 'utf-8'),
      'Cache-Control': 'no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    });
    if (method === 'HEAD') {
      response.end();
    } else {
      response.end(body);
    }
    return;
  }

  const responseTemplate = templateResponse(url, fixture);
  if (responseTemplate !== undefined) {
    response.writeHead(200, {
      'Content-Type': responseTemplate.contentType,
      'Content-Length': Buffer.byteLength(responseTemplate.body, 'utf-8'),
      'Cache-Control': 'no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    });
    if (method === 'HEAD') {
      response.end();
    } else {
      response.end(responseTemplate.body);
    }
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found\n');
}

export async function createTemplateServer(
  options: TemplateServerOptions = {},
): Promise<TemplateServerHandle> {
  const host = validateHost(options.host ?? '127.0.0.1');
  const port = validatePort(options.port ?? 4_174);

  if (!isLoopbackHost(host) && options.allowLan !== true) {
    throw new Error('Non-loopback template server binding requires explicit allowLan');
  }

  const env = options.env ?? process.env;
  const sockets = new Set<Socket>();
  const state: TemplateServerState = { sonarqubeAuthenticated: false };
  let fixture: TemplateReportFixture | undefined;
  let origin = '';

  const server = createServer((request, response) => {
    request.resume();

    if (fixture === undefined) {
      if (!response.headersSent) {
        response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Service Unavailable\n');
      } else {
        response.destroy();
      }
      return;
    }

    try {
      handleTemplateRequest(request, response, fixture, origin, state);
    } catch {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Internal Server Error\n');
      } else {
        response.destroy();
      }
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Template server did not expose a TCP address');
  }

  const resolvedPort = address.port;
  const cleanHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const formattedHost = cleanHost.includes(':') ? `[${cleanHost}]` : cleanHost;
  origin = new URL(`http://${formattedHost}:${resolvedPort}`).origin;

  try {
    fixture = await loadTemplateReportFixture(env, origin);
  } catch (error) {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }

  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error !== undefined && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      };
      timer = setTimeout(() => {
        for (const socket of sockets) socket.destroy();
      }, SHUTDOWN_GRACE_MS);
      timer.unref?.();
      server.close((error) => finish(error));
    });
    return closePromise;
  };

  return {
    server,
    host,
    port: resolvedPort,
    url: `${origin}/`,
    fixture,
    close,
    resetAuthState: () => {
      state.sonarqubeAuthenticated = false;
    },
  };
}
