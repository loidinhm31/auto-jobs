import { createServer, type Server } from 'node:http';
import { isIP, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';

import { assertReportRoot } from './report-server-file-io.js';
import { handleReportRequest } from './report-server-files.js';
import { handleControlRequest } from './report-server-control.js';
import { createConfigStore } from './report-server-config-store.js';
import { createRunManager, type RunManagerOptions } from './report-server-run-manager.js';

const SHUTDOWN_GRACE_MS = 2_000;

export interface ReportServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly allowLan?: boolean;
  readonly mode?: 'report' | 'control';
  readonly configRoot?: string;
  readonly runManagerOptions?: Partial<RunManagerOptions>;
}

export interface ReportServerHandle {
  readonly server: Server;
  readonly root: string;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly mode: 'report' | 'control';
  readonly csrfToken?: string | undefined;
  readonly close: () => Promise<void>;
}

function validateHost(host: string): string {
  if (host.length === 0 || host.length > 255 || /[\u0000-\u0020\u007f]/u.test(host)) {
    throw new Error('REPORT_HOST must be a non-empty host without whitespace or control characters');
  }
  return host;
}

function validatePort(port: number): number {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error('Report server port must be between 0 and 65535');
  return port;
}

export function isLoopbackHost(host: string): boolean {
  return host.toLowerCase() === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'));
}

export async function createReportServer(
  reportRoot: string,
  options: ReportServerOptions = {},
): Promise<ReportServerHandle> {
  const mode = options.mode ?? 'report';
  const host = validateHost(options.host ?? '127.0.0.1');
  const port = validatePort(options.port ?? 4_173);

  if (mode === 'control') {
    if (!isLoopbackHost(host)) {
      throw new Error('Control mode cannot be bound to non-loopback host');
    }
    if (options.allowLan === true) {
      throw new Error('Control mode cannot be combined with --allow-lan');
    }
  } else if (!isLoopbackHost(host) && options.allowLan !== true) {
    throw new Error('Non-loopback report server binding requires explicit --allow-lan');
  }

  const root = mode === 'report' ? (await assertReportRoot(reportRoot)).path : reportRoot;
  const rootIdentity = mode === 'report' ? (await assertReportRoot(reportRoot)).identity : undefined;

  let csrfToken: string | undefined;
  let controlContext: Parameters<typeof handleControlRequest>[0] | undefined;

  if (mode === 'control') {
    csrfToken = randomBytes(32).toString('hex');
    const configRoot = options.configRoot ?? 'config';
    const configStore = await createConfigStore(configRoot);
    const runManager = createRunManager({
      configStore,
      reportRoot: root,
      ...options.runManagerOptions,
    });
    controlContext = {
      configStore,
      runManager,
      reportRoot: root,
      host,
      port,
      csrfToken,
    };
  }

  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    if (mode === 'control' && controlContext !== undefined) {
      void handleControlRequest(controlContext, request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500).end('internal control server error\n');
        else response.destroy();
      });
    } else {
      void handleReportRequest(root, request, response, rootIdentity).catch(() => {
        if (!response.headersSent) response.writeHead(500).end('unable to read report file\n');
        else response.destroy();
      });
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Report server did not expose a TCP address');
  }

  if (controlContext !== undefined) {
    (controlContext as unknown as { port: number }).port = address.port;
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

  const formattedHost = host.includes(':') ? `[${host}]` : host;
  return {
    server,
    root,
    host,
    port: address.port,
    url: `http://${formattedHost}:${address.port}/`,
    mode,
    csrfToken,
    close,
  };
}
