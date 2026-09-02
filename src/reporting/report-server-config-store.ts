import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

import { MAX_CONFIG_FILE_BYTES } from './report-server-constants.js';
import { assertProjectConfigDocument } from '../config/project-config-schema.js';
import type { ProjectConfigDocumentV1 } from '../config/config-types.js';

const SAFE_CONFIG_NAME = /^[a-z0-9][a-z0-9._-]{0,63}\.json$/i;

export interface ConfigSummary {
  readonly name: string;
}

export interface ConfigFileEntry {
  readonly name: string;
  readonly etag: string;
  readonly document: ProjectConfigDocumentV1;
}

export interface ConfigStore {
  readonly root: string;
  listConfigs(): Promise<readonly ConfigSummary[]>;
  readConfig(name: string): Promise<ConfigFileEntry>;
  writeConfig(name: string, document: unknown, ifMatch: string): Promise<ConfigFileEntry>;
}

export function isValidConfigName(name: string): boolean {
  return SAFE_CONFIG_NAME.test(name) && !name.includes('..') && !name.includes('/') && !name.includes('\\');
}

export function calculateEtag(content: string | Buffer): string {
  const hash = createHash('sha256').update(content).digest('hex');
  return `"${hash}"`;
}

async function assertDirectoryIsSafe(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath);
  let stat: fs.Stats;
  try {
    stat = await fsp.lstat(resolved);
  } catch {
    throw new Error(`config root does not exist: ${resolved}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('config root must be a real directory without symlinks');
  }
  const canonical = await fsp.realpath(resolved);
  return canonical;
}

export async function createConfigStore(configDirectory: string): Promise<ConfigStore> {
  const canonicalRoot = await assertDirectoryIsSafe(configDirectory);
  const writeLocks = new Map<string, Promise<void>>();

  async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    while (writeLocks.has(name)) {
      await writeLocks.get(name);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => { resolveLock = resolve; });
    writeLocks.set(name, lockPromise);
    try {
      return await fn();
    } finally {
      writeLocks.delete(name);
      resolveLock();
    }
  }

  async function resolveSafeConfigPath(name: string): Promise<string> {
    if (!isValidConfigName(name)) {
      throw new Error(`invalid config name: '${name}'`);
    }
    const targetPath = path.join(canonicalRoot, name);
    const resolved = path.resolve(targetPath);
    if (path.dirname(resolved) !== canonicalRoot) {
      throw new Error('path traversal detected');
    }
    return resolved;
  }

  async function listConfigs(): Promise<readonly ConfigSummary[]> {
    const entries = await fsp.readdir(canonicalRoot, { withFileTypes: true });
    const configs: ConfigSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      if (isValidConfigName(entry.name) && !entry.name.startsWith('.')) {
        configs.push({ name: entry.name });
      }
      if (configs.length >= 100) break;
    }
    configs.sort((a, b) => a.name.localeCompare(b.name));
    return Object.freeze(configs);
  }

  async function readConfig(name: string): Promise<ConfigFileEntry> {
    const filePath = await resolveSafeConfigPath(name);
    let stat: fs.Stats;
    try {
      stat = await fsp.lstat(filePath);
    } catch {
      throw new Error(`config file '${name}' not found`);
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CONFIG_FILE_BYTES) {
      throw new Error(`config file '${name}' must be a regular file under 1 MiB`);
    }
    const content = await fsp.readFile(filePath, 'utf8');
    const etag = calculateEtag(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`config file '${name}' contains malformed JSON`);
    }
    const document = assertProjectConfigDocument(parsed);
    return { name, etag, document };
  }

  async function writeConfig(name: string, document: unknown, ifMatch: string): Promise<ConfigFileEntry> {
    return withLock(name, async () => {
      const filePath = await resolveSafeConfigPath(name);
      const current = await readConfig(name);
      const cleanIfMatch = ifMatch.trim();
      if (cleanIfMatch !== current.etag && cleanIfMatch !== '*') {
        throw new Error('ETag precondition failed: file has been modified');
      }

      const validated = assertProjectConfigDocument(document);
      const serialized = `${JSON.stringify(validated, null, 2)}\n`;
      if (Buffer.byteLength(serialized) > MAX_CONFIG_FILE_BYTES) {
        throw new Error('serialized config exceeds 1 MiB limit');
      }

      const tempFileName = `.${name}.${randomBytes(8).toString('hex')}.tmp`;
      const tempFilePath = path.join(canonicalRoot, tempFileName);

      const fileHandle = await fsp.open(tempFilePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
      try {
        await fileHandle.writeFile(serialized, 'utf8');
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }

      try {
        await fsp.rename(tempFilePath, filePath);
      } catch (err) {
        await fsp.unlink(tempFilePath).catch(() => undefined);
        throw err;
      }

      return await readConfig(name);
    });
  }

  return {
    root: canonicalRoot,
    listConfigs,
    readConfig,
    writeConfig,
  };
}
