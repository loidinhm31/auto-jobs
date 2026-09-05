import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTemplateServer, type TemplateServerHandle } from './template-server.js';

const DEFAULT_TEMPLATE_HOST = '127.0.0.1';
const DEFAULT_TEMPLATE_PORT = 4_174;

export interface TemplateServerConfig {
  readonly host: string;
  readonly port: number;
  readonly help: boolean;
}

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
}

function parsePort(value: string, fieldName: string): number {
  if (!/^\d{1,5}$/u.test(value)) throw new Error(`${fieldName} must be a port number between 0 and 65535`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error(`${fieldName} must be a port number between 0 and 65535`);
  return port;
}

function nextArgument(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith('--') || /^-[a-zA-Z]/u.test(value)) {
    throw new Error(`${option} requires a value`);
  }
  return value.trim();
}

export function parseTemplateServerArgs(
  argv: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): TemplateServerConfig {
  let host = nonEmpty(env['TEMPLATE_HOST'], DEFAULT_TEMPLATE_HOST);
  let port = parsePort(nonEmpty(env['TEMPLATE_PORT'], String(DEFAULT_TEMPLATE_PORT)), 'TEMPLATE_PORT');
  let help = false;

  let index = 0;
  while (index < argv.length) {
    const argument = argv[index];
    if (argument === undefined) break;
    if (argument === '--help' || argument === '-h') {
      help = true;
      index += 1;
      continue;
    }
    if (argument === '--host') {
      host = nextArgument(argv, index, argument);
      index += 2;
      continue;
    }
    if (argument.startsWith('--host=')) {
      const val = argument.slice('--host='.length).trim();
      if (val.length === 0) throw new Error('--host requires a value');
      host = val;
      index += 1;
      continue;
    }
    if (argument === '--port') {
      port = parsePort(nextArgument(argv, index, argument), argument);
      index += 2;
      continue;
    }
    if (argument.startsWith('--port=')) {
      const val = argument.slice('--port='.length).trim();
      port = parsePort(val, '--port');
      index += 1;
      continue;
    }
    throw new Error(`unknown template server option: ${argument}`);
  }

  return {
    host,
    port,
    help,
  };
}

function usage(): void {
  console.log('Usage: npm run serve:templates -- [--host 127.0.0.1] [--port 4174]');
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<TemplateServerHandle | undefined> {
  const config = parseTemplateServerArgs(argv, env);
  if (config.help) {
    usage();
    return undefined;
  }
  const handle = await createTemplateServer({
    host: config.host,
    port: config.port,
    env,
  });

  console.log(`Template server: ${handle.url}`);

  const cleanupSignals = () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  };

  const stop = () => {
    cleanupSignals();
    void handle.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  const originalClose = handle.close;
  const wrappedClose = async () => {
    cleanupSignals();
    await originalClose();
  };

  return {
    ...handle,
    close: wrappedClose,
  };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
