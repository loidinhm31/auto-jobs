import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReportServer } from './report-server.js';

const DEFAULT_REPORT_ROOT = 'reports';
const DEFAULT_CONFIG_ROOT = 'config';
const DEFAULT_REPORT_HOST = '127.0.0.1';
const DEFAULT_REPORT_PORT = 4_173;

export interface ReportServerConfig {
  readonly root: string;
  readonly configRoot: string;
  readonly host: string;
  readonly port: number;
  readonly allowLan: boolean;
  readonly mode: 'report' | 'control';
  readonly help: boolean;
  readonly envOverrides?: Readonly<Record<string, string>>;
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
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

export function parseReportServerArgs(argv: readonly string[] = [], env: NodeJS.ProcessEnv = process.env): ReportServerConfig {
  let root = nonEmpty(env['REPORT_ROOT'] ?? env['ARTIFACT_DIR'], DEFAULT_REPORT_ROOT);
  let configRoot = nonEmpty(env['CONFIG_ROOT'], DEFAULT_CONFIG_ROOT);
  let host = nonEmpty(env['REPORT_HOST'], DEFAULT_REPORT_HOST);
  let port = parsePort(nonEmpty(env['REPORT_PORT'], String(DEFAULT_REPORT_PORT)), 'REPORT_PORT');
  let allowLan = env['REPORT_ALLOW_LAN'] === '1';
  let mode: 'report' | 'control' = 'report';
  let help = false;
  const envOverrides: Record<string, string> = {};

  let index = 0;
  while (index < argv.length) {
    const argument = argv[index];
    if (argument === undefined) break;
    if (argument === '--help' || argument === '-h') { help = true; index += 1; continue; }
    if (argument === '--root') { root = nextArgument(argv, index, argument); index += 2; continue; }
    if (argument === '--config-root') { configRoot = nextArgument(argv, index, argument); index += 2; continue; }
    if (argument === '--host') { host = nextArgument(argv, index, argument); index += 2; continue; }
    if (argument === '--port') { port = parsePort(nextArgument(argv, index, argument), argument); index += 2; continue; }
    if (argument === '--allow-lan') { allowLan = true; index += 1; continue; }
    if (argument === '--control') { mode = 'control'; index += 1; continue; }
    if (argument === '--env') {
      const assignment = nextArgument(argv, index, argument);
      index += 2;
      const separator = assignment.indexOf('=');
      if (separator <= 0) {
        throw new Error('--env requires NAME=VALUE');
      }
      const name = assignment.slice(0, separator);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error('--env name is invalid');
      envOverrides[name] = assignment.slice(separator + 1);
      continue;
    }
    if (argument.startsWith('--env=')) {
      const assignment = argument.slice('--env='.length);
      const separator = assignment.indexOf('=');
      if (separator <= 0) {
        throw new Error('--env requires NAME=VALUE');
      }
      const name = assignment.slice(0, separator);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error('--env name is invalid');
      envOverrides[name] = assignment.slice(separator + 1);
      index += 1;
      continue;
    }
    if (argument === '--headless') {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--') && ['true', 'false', '1', '0', 'yes', 'no'].includes(next.toLowerCase())) {
        envOverrides['PLAYWRIGHT_HEADLESS'] = next;
        index += 2;
      } else {
        envOverrides['PLAYWRIGHT_HEADLESS'] = 'true';
        index += 1;
      }
      continue;
    }
    if (argument.startsWith('--headless=')) {
      const val = argument.slice('--headless='.length).trim();
      if (!['true', 'false', '1', '0', 'yes', 'no'].includes(val.toLowerCase())) {
        throw new Error('--headless must be true or false');
      }
      envOverrides['PLAYWRIGHT_HEADLESS'] = val;
      index += 1;
      continue;
    }
    if (argument === '--executable-path') {
      const execPath = nextArgument(argv, index, argument);
      index += 2;
      envOverrides['PLAYWRIGHT_EXECUTABLE_PATH'] = execPath;
      continue;
    }
    if (argument.startsWith('--executable-path=')) {
      const execPath = argument.slice('--executable-path='.length).trim();
      if (execPath.length === 0) throw new Error('--executable-path requires a value');
      envOverrides['PLAYWRIGHT_EXECUTABLE_PATH'] = execPath;
      index += 1;
      continue;
    }
    throw new Error(`unknown report server option: ${argument}`);
  }

  if (mode === 'control' && allowLan) {
    throw new Error('Control mode cannot be combined with --allow-lan');
  }

  return {
    root: path.resolve(root),
    configRoot: path.resolve(configRoot),
    host,
    port,
    allowLan,
    mode,
    help,
    ...(Object.keys(envOverrides).length > 0 ? { envOverrides } : {}),
  };
}

function lanUrls(host: string, port: number): string[] {
  if (host !== '0.0.0.0' && host !== '::') return [];
  const addresses = Object.values(os.networkInterfaces()).flatMap((items) => items ?? [])
    .filter((item) => !item.internal && (item.family === 'IPv4' || (host === '::' && item.family === 'IPv6')))
    .map((item) => item.family === 'IPv6' ? `http://[${item.address}]:${port}/` : `http://${item.address}:${port}/`);
  return [...new Set(addresses)].sort();
}

function usage(): void {
  console.log('Usage: npm run serve:report -- [--root reports] [--host 127.0.0.1] [--port 4173] [--allow-lan] [--env NAME=VALUE] [--headless[=true|false]] [--executable-path <path>]');
  console.log('       npm run serve:control -- [--root reports] [--config-root config] [--host 127.0.0.1] [--port 4173] [--env NAME=VALUE] [--headless[=true|false]] [--executable-path <path>]');
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = parseReportServerArgs(argv, env);
  if (config.help) { usage(); return; }
  if (config.envOverrides) {
    for (const [key, value] of Object.entries(config.envOverrides)) {
      process.env[key] = value;
    }
  }
  const handle = await createReportServer(config.root, {
    host: config.host,
    port: config.port,
    allowLan: config.allowLan,
    mode: config.mode,
    configRoot: config.configRoot,
  });

  if (handle.mode === 'control') {
    console.log(`Control server: ${handle.url} (config root: ${config.configRoot}, reports root: ${handle.root})`);
  } else {
    console.log(`Report server: ${handle.url} (root ${handle.root})`);
    const urls = lanUrls(handle.host, handle.port);
    if (urls.length > 0) {
      console.warn('WARNING: this is an unauthenticated read-only server bound to all requested interfaces; configure a firewall and use a trusted network.');
      for (const url of urls) console.log(`LAN: ${url}`);
    }
  }

  const stop = () => { void handle.close().then(() => process.exit(0), () => process.exit(1)); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
