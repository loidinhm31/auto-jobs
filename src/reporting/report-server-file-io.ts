import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { AGGREGATE_REPORT_MARKER, MAX_STATIC_FILE_BYTES } from './report-server-constants.js';

const DIRECTORY_FLAGS = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const FILE_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const MAX_MARKER_SCAN_BYTES = 64 * 1_024;

export interface ReportRootIdentity {
  readonly dev: number;
  readonly ino: number;
}

export interface ReportRootReference {
  readonly path: string;
  readonly identity: ReportRootIdentity;
}

function sameIdentity(left: ReportRootIdentity, right: ReportRootIdentity): boolean {
  return left.ino === right.ino && (left.dev === right.dev || left.dev === 0 || right.dev === 0);
}

function descriptorPath(handle: fsp.FileHandle): Promise<string> {
  return fsp.realpath(`/proc/self/fd/${handle.fd}`);
}

function descriptorChild(handle: fsp.FileHandle, segment: string): string {
  return path.join('/proc/self/fd', String(handle.fd), segment);
}

interface OpenedDirectory {
  readonly handle: fsp.FileHandle;
  readonly path: string;
  readonly root: string;
  readonly rootIdentity: ReportRootIdentity;
}

async function windowsPathIsSafe(root: string, filename: string, handle?: fsp.FileHandle): Promise<boolean> {
  try {
    let current = path.parse(filename).root;
    for (const segment of path.relative(current, filename).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if ((await fsp.lstat(current)).isSymbolicLink()) return false;
    }
    const canonicalRoot = await fsp.realpath(root);
    const canonicalFilename = await fsp.realpath(filename);
    const relative = path.relative(canonicalRoot, canonicalFilename);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    if (handle !== undefined) {
      const [pathStat, handleStat] = await Promise.all([fsp.stat(filename), handle.stat()]);
      if (!sameIdentity(pathStat, handleStat)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function windowsDirectoryIsStable(directory: OpenedDirectory): Promise<boolean> {
  if (!(await windowsPathIsSafe(directory.root, directory.path, directory.handle))) return false;
  if (directory.rootIdentity === undefined) return true;
  const rootStat = await fsp.stat(directory.root);
  return sameIdentity(rootStat, directory.rootIdentity);
}

function childPath(directory: OpenedDirectory, segment: string): string {
  return process.platform === 'win32'
    ? path.join(directory.path, segment)
    : descriptorChild(directory.handle, segment);
}

async function openCanonicalDirectory(directory: string, expectedRootIdentity?: ReportRootIdentity): Promise<OpenedDirectory> {
  const resolved = path.resolve(directory);
  if (process.platform === 'win32') {
    if (!(await windowsPathIsSafe(resolved, resolved))) throw new Error('Report root changed while it was being opened');
    const handle = await fsp.open(resolved, fs.constants.O_RDONLY);
    try {
      const stat = await handle.stat();
      const identity = { dev: stat.dev, ino: stat.ino };
      if (!stat.isDirectory() || !sameIdentity(identity, expectedRootIdentity ?? identity) || !(await windowsPathIsSafe(resolved, resolved, handle))) {
        throw new Error('Report root changed while it was being opened');
      }
      return { handle, path: resolved, root: resolved, rootIdentity: expectedRootIdentity ?? identity };
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
  }
  const filesystemRoot = path.parse(resolved).root;
  let handle = await fsp.open(filesystemRoot, DIRECTORY_FLAGS);
  try {
    for (const segment of path.relative(filesystemRoot, resolved).split(path.sep).filter(Boolean)) {
      const child = await fsp.open(descriptorChild(handle, segment), DIRECTORY_FLAGS);
      await handle.close();
      handle = child;
    }
    if (await descriptorPath(handle) !== resolved) throw new Error('Report root changed while it was being opened');
    const stat = await handle.stat();
    const identity = { dev: stat.dev, ino: stat.ino };
    if (!stat.isDirectory() || !sameIdentity(identity, expectedRootIdentity ?? identity)) throw new Error('Report root changed while it was being opened');
    return { handle, path: resolved, root: resolved, rootIdentity: expectedRootIdentity ?? identity };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function readMarkerPrefix(handle: fsp.FileHandle, expectedSize: number): Promise<Buffer> {
  const limit = Math.min(MAX_MARKER_SCAN_BYTES, expectedSize);
  const chunks: Buffer[] = [];
  let total = 0;
  while (total < limit) {
    const chunk = Buffer.alloc(Math.min(64 * 1_024, limit - total));
    const result = await handle.read(chunk, 0, chunk.byteLength, total);
    if (result.bytesRead === 0) break;
    chunks.push(chunk.subarray(0, result.bytesRead));
    total += result.bytesRead;
  }
  const finalStat = await handle.stat();
  if (!finalStat.isFile() || finalStat.size !== expectedSize || total !== limit) {
    throw new Error('Report server root index changed while it was being checked');
  }
  return Buffer.concat(chunks, total);
}

export async function assertReportRoot(reportRoot: string): Promise<ReportRootReference> {
  const requestedRoot = path.resolve(reportRoot);
  let stat: Awaited<ReturnType<typeof fsp.lstat>>;
  try {
    stat = await fsp.lstat(requestedRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Report root does not exist: ${requestedRoot}; run npm run report first`);
    }
    throw error;
  }
  const canonicalRoot = await fsp.realpath(requestedRoot);
  const rootIsSafe = process.platform === 'win32'
    ? await windowsPathIsSafe(canonicalRoot, requestedRoot)
    : canonicalRoot === requestedRoot;
  if (!stat.isDirectory() || stat.isSymbolicLink() || !rootIsSafe) {
    throw new Error('Report server root must be a real directory without symbolic-link components');
  }
  const root = canonicalRoot;
  const handle = await openCanonicalDirectory(root);
  try {
    const markerPath = childPath(handle, 'index.html');
    if (process.platform === 'win32' && (!(await windowsDirectoryIsStable(handle)) || !(await windowsPathIsSafe(handle.root, markerPath)))) {
      throw new Error('Report server root must contain a generated aggregate index.html');
    }
    const marker = await fsp.open(markerPath, FILE_FLAGS);
    try {
      const markerStat = await marker.stat();
      if ((process.platform === 'win32' && (!(await windowsDirectoryIsStable(handle)) || !(await windowsPathIsSafe(handle.root, markerPath, marker)))) || !markerStat.isFile() || markerStat.isSymbolicLink() || !(await readMarkerPrefix(marker, markerStat.size)).toString('utf8').includes(AGGREGATE_REPORT_MARKER)) {
        throw new Error('Report server root must contain a generated aggregate index.html');
      }
    } finally {
      await marker.close();
    }
    const rootStat = await handle.handle.stat();
    if (!rootStat.isDirectory()) throw new Error('Report server root must be a real directory without symbolic-link components');
    return { path: root, identity: { dev: rootStat.dev, ino: rootStat.ino } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Report server root must contain a generated aggregate index.html');
    throw error;
  } finally {
    await handle.handle.close();
  }
}

export interface OpenedReportFile {
  readonly handle: fsp.FileHandle;
  readonly filename: string;
  readonly size: number;
}

function expectedFile(filenameSegments: readonly string[]): string {
  return filenameSegments.length === 0 ? 'index.html' : path.join(...filenameSegments);
}

async function closeExcept(handles: readonly fsp.FileHandle[], keep: fsp.FileHandle): Promise<void> {
  for (const handle of handles) if (handle !== keep) await handle.close().catch(() => undefined);
}

async function closeHandles(handles: readonly fsp.FileHandle[]): Promise<void> {
  for (const handle of handles) await handle.close().catch(() => undefined);
}

export async function openReportFile(root: string, decodedPath: string, expectedRootIdentity?: ReportRootIdentity): Promise<OpenedReportFile | undefined> {
  const segments = decodedPath.split('/').filter(Boolean);
  const handles: fsp.FileHandle[] = [];
  let directory: OpenedDirectory | undefined;
  try {
    directory = await openCanonicalDirectory(root, expectedRootIdentity);
    handles.push(directory.handle);
    let filenameSegments = [...segments];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment === undefined || directory === undefined) return undefined;
      const entryPath = childPath(directory, segment);
      if (process.platform === 'win32' && (!(await windowsDirectoryIsStable(directory)) || !(await windowsPathIsSafe(directory.root, entryPath)))) return undefined;
      const entry = await fsp.open(entryPath, FILE_FLAGS);
      handles.push(entry);
      const stat = await entry.stat();
      if (process.platform === 'win32' && (!(await windowsDirectoryIsStable(directory)) || !(await windowsPathIsSafe(directory.root, entryPath, entry)))) return undefined;
      if (index < segments.length - 1) {
        if (!stat.isDirectory()) return undefined;
        directory = { handle: entry, path: path.join(directory.path, segment), root: directory.root, rootIdentity: directory.rootIdentity };
        continue;
      }
      if (stat.isFile()) {
        if (stat.size > MAX_STATIC_FILE_BYTES) return undefined;
        handles.pop();
        await closeExcept(handles, entry);
        return { handle: entry, filename: expectedFile(filenameSegments), size: stat.size };
      }
      if (!stat.isDirectory()) return undefined;
      directory = { handle: entry, path: path.join(directory.path, segment), root: directory.root, rootIdentity: directory.rootIdentity };
      filenameSegments = [...segments, 'index.html'];
    }
    if (directory === undefined) return undefined;
    const entryPath = childPath(directory, 'index.html');
    if (process.platform === 'win32' && (!(await windowsDirectoryIsStable(directory)) || !(await windowsPathIsSafe(directory.root, entryPath)))) return undefined;
    const entry = await fsp.open(entryPath, FILE_FLAGS);
    handles.push(entry);
    const stat = await entry.stat();
    if (process.platform === 'win32' && (!(await windowsDirectoryIsStable(directory)) || !(await windowsPathIsSafe(directory.root, entryPath, entry)))) return undefined;
    if (!stat.isFile() || stat.size > MAX_STATIC_FILE_BYTES) return undefined;
    handles.pop();
    await closeExcept(handles, entry);
    return { handle: entry, filename: expectedFile(filenameSegments), size: stat.size };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR' && code !== 'ELOOP' && code !== 'EACCES') throw error;
    return undefined;
  } finally {
    await closeHandles(handles);
  }
}

export async function readBounded(file: OpenedReportFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const remaining = MAX_STATIC_FILE_BYTES + 1 - total;
    if (remaining <= 0) throw new Error('report file exceeds the safe size limit');
    const chunk = Buffer.alloc(Math.min(64 * 1_024, remaining));
    const result = await file.handle.read(chunk, 0, chunk.byteLength, total);
    if (result.bytesRead === 0) break;
    chunks.push(chunk.subarray(0, result.bytesRead));
    total += result.bytesRead;
  }
  const finalStat = await file.handle.stat();
  if (!finalStat.isFile() || finalStat.size > MAX_STATIC_FILE_BYTES || finalStat.size !== file.size || total !== finalStat.size) {
    throw new Error('report file changed while it was being served');
  }
  return Buffer.concat(chunks, total);
}
