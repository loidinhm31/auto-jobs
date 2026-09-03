import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

import { MAX_SECRET_FILE_BYTES, SECRETS_FILE_NAME } from './report-server-constants.js';

const SAFE_SECRET_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

export interface SecretStore {
  readonly root: string;
  readonly filePath: string;
  readSecrets(): Promise<Readonly<Record<string, string>>>;
  listSecretNames(): Promise<ReadonlyArray<string>>;
  putSecret(name: string, value: string): Promise<void>;
  putSecrets(entries: Record<string, string>): Promise<void>;
  deleteSecret(name: string): Promise<void>;
  deleteSecrets(names: readonly string[]): Promise<void>;
}
export function isValidSecretKey(name: string): boolean {
  return typeof name === 'string' && SAFE_SECRET_KEY.test(name) && name !== '__proto__' && name !== 'prototype' && name !== 'constructor';
}
export function assertValidSecretKey(name: string): void {
  if (!isValidSecretKey(name)) throw new Error(`invalid secret key name: '${typeof name === 'string' ? name.slice(0, 64) : String(name)}'`);
}

export function assertValidSecretValue(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new Error(`secret value for key '${name}' must be a string`);
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
  return await fsp.realpath(resolved);
}

export async function createSecretStore(configDirectory: string): Promise<SecretStore> {
  const canonicalRoot = await assertDirectoryIsSafe(configDirectory);
  const targetPath = path.resolve(path.join(canonicalRoot, SECRETS_FILE_NAME));
  if (path.dirname(targetPath) !== canonicalRoot) {
    throw new Error('path traversal detected');
  }

  let writeLock: Promise<void> | undefined;

  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    while (writeLock !== undefined) {
      await writeLock;
    }
    let resolveLock!: () => void;
    writeLock = new Promise<void>((resolve) => { resolveLock = resolve; });
    try {
      return await fn();
    } finally {
      writeLock = undefined;
      resolveLock();
    }
  }

  async function readRawSecrets(): Promise<Record<string, string>> {
    let stat: fs.Stats;
    try {
      stat = await fsp.lstat(targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }

    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SECRET_FILE_BYTES) {
      throw new Error(`secrets file must be a regular file under ${MAX_SECRET_FILE_BYTES} bytes`);
    }

    const content = await fsp.readFile(targetPath, 'utf8');
    if (content.trim().length === 0) return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('secrets file contains malformed JSON');
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('secrets file must contain a JSON object');
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      assertValidSecretKey(key);
      assertValidSecretValue(key, value);
      result[key] = value;
    }
    return result;
  }

  async function writeRawSecrets(secrets: Record<string, string>): Promise<void> {
    const sortedKeys = Object.keys(secrets).sort((a, b) => a.localeCompare(b));
    const normalized: Record<string, string> = {};
    for (const key of sortedKeys) {
      assertValidSecretKey(key);
      assertValidSecretValue(key, secrets[key]);
      normalized[key] = secrets[key];
    }

    const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > MAX_SECRET_FILE_BYTES) {
      throw new Error(`serialized secrets exceed ${MAX_SECRET_FILE_BYTES} bytes limit`);
    }

    const tempFileName = `.${SECRETS_FILE_NAME}.${randomBytes(8).toString('hex')}.tmp`;
    const tempFilePath = path.join(canonicalRoot, tempFileName);
    let fileHandle: fsp.FileHandle | undefined;
    try {
      try {
        fileHandle = await fsp.open(tempFilePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
        await fileHandle.writeFile(serialized, 'utf8');
        await fileHandle.sync();
      } finally {
        if (fileHandle !== undefined) await fileHandle.close().catch(() => undefined);
      }
      await fsp.rename(tempFilePath, targetPath);
    } catch (err) {
      await fsp.unlink(tempFilePath).catch(() => undefined);
      throw err;
    }
  }

  return {
    root: canonicalRoot,
    filePath: targetPath,
    readSecrets: async () => Object.freeze({ ...(await readRawSecrets()) }),
    listSecretNames: async () => Object.freeze(Object.keys(await readRawSecrets()).sort((a, b) => a.localeCompare(b))),
    putSecret: async (name: string, value: string) => {
      assertValidSecretKey(name);
      assertValidSecretValue(name, value);
      await withLock(async () => {
        const current = await readRawSecrets();
        current[name] = value;
        await writeRawSecrets(current);
      });
    },
    putSecrets: async (entries: Record<string, string>) => {
      if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) {
        throw new Error('secret entries must be a non-null object');
      }
      if (Object.keys(entries).length === 0) return;
      for (const [key, value] of Object.entries(entries)) {
        assertValidSecretKey(key);
        assertValidSecretValue(key, value);
      }
      await withLock(async () => {
        const current = await readRawSecrets();
        for (const [key, value] of Object.entries(entries)) {
          current[key] = value;
        }
        await writeRawSecrets(current);
      });
    },
    deleteSecret: async (name: string) => {
      assertValidSecretKey(name);
      await withLock(async () => {
        const current = await readRawSecrets();
        if (Object.prototype.hasOwnProperty.call(current, name)) {
          delete current[name];
          await writeRawSecrets(current);
        }
      });
    },
    deleteSecrets: async (names: readonly string[]) => {
      if (!Array.isArray(names)) throw new Error('secret names must be an array');
      for (const name of names) assertValidSecretKey(name);
      await withLock(async () => {
        const current = await readRawSecrets();
        let changed = false;
        for (const name of names) {
          if (Object.prototype.hasOwnProperty.call(current, name)) {
            delete current[name];
            changed = true;
          }
        }
        if (changed) await writeRawSecrets(current);
      });
    },
  };
}
