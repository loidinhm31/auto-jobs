import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP, type Socket } from 'node:net';

import { escapeHtml, isExactFixtureUrl } from './template-fixture-html.js';
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

export type DeveloperHubEndpoints = Pick<
  TemplateReportFixture,
  | 'loginUrl'
  | 'jobUrl'
  | 'buildPageUrl'
  | 'snykReportUrl'
  | 'snykSummaryUrl'
  | 'sonarqubeLoginUrl'
  | 'sonarqubeHomeUrl'
  | 'sonarqubeOverallUrl'
  | 'sonarqubeIssuesUrl'
>;

function validateSafeHubUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return rawUrl;
    }
  } catch {
    if (rawUrl.startsWith('/') && !rawUrl.startsWith('//') && !rawUrl.includes('\\')) {
      return rawUrl;
    }
  }
  throw new Error(`Unsafe URL scheme detected in Developer Hub link: ${rawUrl}`);
}

export function buildDeveloperHubHtml(fixture: DeveloperHubEndpoints): string {
  const links: ReadonlyArray<{ category: string; name: string; url: string; description: string }> = [
    {
      category: 'Jenkins',
      name: 'Jenkins Login',
      url: validateSafeHubUrl(fixture.loginUrl),
      description: 'Login page for authentication testing',
    },
    {
      category: 'Jenkins',
      name: 'Jenkins Job Page',
      url: validateSafeHubUrl(fixture.jobUrl),
      description: 'Main project job page with links to reports and builds',
    },
    {
      category: 'Jenkins',
      name: 'Jenkins Build (Parameterized)',
      url: validateSafeHubUrl(fixture.buildPageUrl),
      description: 'Build parameters page with action trigger',
    },
    {
      category: 'Snyk',
      name: 'Snyk Report',
      url: validateSafeHubUrl(fixture.snykReportUrl),
      description: 'Vulnerability scan HTML report artifact',
    },
    {
      category: 'Snyk',
      name: 'Snyk Summary (JSON)',
      url: validateSafeHubUrl(fixture.snykSummaryUrl),
      description: 'Raw JSON summary of SCA findings and severity counts',
    },
    {
      category: 'SonarQube',
      name: 'SonarQube Login',
      url: validateSafeHubUrl(fixture.sonarqubeLoginUrl),
      description: 'Authentication entrypoint for SonarQube',
    },
    {
      category: 'SonarQube',
      name: 'SonarQube Home',
      url: validateSafeHubUrl(fixture.sonarqubeHomeUrl),
      description: 'Project dashboard (requires authentication)',
    },
    {
      category: 'SonarQube',
      name: 'SonarQube Overall',
      url: validateSafeHubUrl(fixture.sonarqubeOverallUrl),
      description: 'Overall code quality and metrics view',
    },
    {
      category: 'SonarQube',
      name: 'SonarQube Issues',
      url: validateSafeHubUrl(fixture.sonarqubeIssuesUrl),
      description: 'Project issue list with facets and severity breakdowns',
    },
  ];

  const renderedLinks = links
    .map(
      (link) => `        <li class="endpoint-item">
          <div class="endpoint-header">
            <span class="badge badge-${escapeHtml(link.category.toLowerCase())}">${escapeHtml(link.category)}</span>
            <a class="endpoint-link" href="${escapeHtml(link.url)}">${escapeHtml(link.name)}</a>
          </div>
          <p class="endpoint-desc">${escapeHtml(link.description)}</p>
          <code class="endpoint-url">${escapeHtml(link.url)}</code>
        </li>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Template Mock Server - Developer Hub</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --link: #38bdf8;
      --link-hover: #7dd3fc;
      --badge-jenkins: #f97316;
      --badge-snyk: #8b5cf6;
      --badge-sonarqube: #0ea5e9;
      --code-bg: #0b1120;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
    }
    h1 {
      font-size: 1.875rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    p.subtitle {
      color: var(--text-muted);
      font-size: 1rem;
    }
    .server-status {
      display: inline-block;
      margin-top: 0.75rem;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-radius: 9999px;
      background-color: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    ul.endpoint-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .endpoint-item {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1.25rem;
      transition: border-color 0.15s ease;
    }
    .endpoint-item:hover {
      border-color: #475569;
    }
    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.375rem;
    }
    .endpoint-link {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--link);
      text-decoration: none;
    }
    .endpoint-link:hover {
      color: var(--link-hover);
      text-decoration: underline;
    }
    .endpoint-desc {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }
    .endpoint-url {
      display: block;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      background-color: var(--code-bg);
      padding: 0.375rem 0.625rem;
      border-radius: 0.375rem;
      color: #cbd5e1;
      word-break: break-all;
    }
    .badge {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.15rem 0.5rem;
      border-radius: 0.25rem;
    }
    .badge-jenkins {
      background-color: rgba(249, 115, 22, 0.15);
      color: var(--badge-jenkins);
      border: 1px solid rgba(249, 115, 22, 0.3);
    }
    .badge-snyk {
      background-color: rgba(139, 92, 246, 0.15);
      color: var(--badge-snyk);
      border: 1px solid rgba(139, 92, 246, 0.3);
    }
    .badge-sonarqube {
      background-color: rgba(14, 165, 233, 0.15);
      color: var(--badge-sonarqube);
      border: 1px solid rgba(14, 165, 233, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Template Mock Server</h1>
      <p class="subtitle">Developer Hub &mdash; Mock fixtures and test endpoints</p>
      <span class="server-status">&#9679; Ready</span>
    </header>
    <main>
      <ul class="endpoint-list">
${renderedLinks}
      </ul>
    </main>
  </div>
</body>
</html>
`;
}

function handleTemplateRequest(
  request: IncomingMessage,
  response: ServerResponse,
  fixture: TemplateReportFixture,
  origin: string,
  state: TemplateServerState,
  hubBuffer: Buffer,
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

  // Developer Hub index page (supports / and /index.html)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': hubBuffer.byteLength,
      'Cache-Control': 'no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Frame-Options': 'DENY',
    });
    if (method === 'HEAD') {
      response.end();
    } else {
      response.end(hubBuffer);
    }
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
  let hubBuffer: Buffer | undefined;
  let origin = '';

  const server = createServer((request, response) => {
    request.resume();

    if (fixture === undefined || hubBuffer === undefined) {
      if (!response.headersSent) {
        response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Service Unavailable\n');
      } else {
        response.destroy();
      }
      return;
    }

    try {
      handleTemplateRequest(request, response, fixture, origin, state, hubBuffer);
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
    hubBuffer = Buffer.from(buildDeveloperHubHtml(fixture), 'utf-8');
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
