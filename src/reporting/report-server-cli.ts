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

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') { help = true; continue; }
    if (argument === '--root') { root = nextArgument(argv, index, argument); index += 1; continue; }
    if (argument === '--config-root') { configRoot = nextArgument(argv, index, argument); index += 1; continue; }
    if (argument === '--host') { host = nextArgument(argv, index, argument); index += 1; continue; }
    if (argument === '--port') { port = parsePort(nextArgument(argv, index, argument), argument); index += 1; continue; }
    if (argument === '--allow-lan') { allowLan = true; continue; }
    if (argument === '--control') { mode = 'control'; continue; }
    throw new Error(`unknown report server option: ${argument}`);
  }

  if (mode === 'control' && allowLan) {
    throw new Error('Control mode cannot be combined with --allow-lan');
  }

  return { root: path.resolve(root), configRoot: path.resolve(configRoot), host, port, allowLan, mode, help };
}

function lanUrls(host: string, port: number): string[] {
  if (host !== '0.0.0.0' && host !== '::') return [];
  const addresses = Object.values(os.networkInterfaces()).flatMap((items) => items ?? [])
    .filter((item) => !item.internal && (item.family === 'IPv4' || (host === '::' && item.family === 'IPv6')))
    .map((item) => item.family === 'IPv6' ? `http://[${item.address}]:${port}/` : `http://${item.address}:${port}/`);
  return [...new Set(addresses)].sort();
}

function usage(): void {
  console.log('Usage: npm run serve:report -- [--root reports] [--host 127.0.0.1] [--port 4173] [--allow-lan]');
  console.log('       npm run serve:control -- [--root reports] [--config-root config] [--host 127.0.0.1] [--port 4173]');
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = parseReportServerArgs(argv, env);
  if (config.help) { usage(); return; }
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
