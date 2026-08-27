import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_PREFIX = '.report-runtime-';
const OWNER_FILENAME = '.active';
const OWNER_SCRIPT = path.basename(process.argv[1] ?? fileURLToPath(import.meta.url));
const STALE_RUNTIME_AGE_MS = 24 * 60 * 60 * 1_000;
const RUNTIME_HEARTBEAT_MS = 60 * 1_000;
const MAX_STALE_RUNTIME_ENTRIES = 16;
const MAX_RUNTIME_ROOT_SCAN_ENTRIES = 8_192;
const MAX_RUNTIME_SCAN_ENTRIES = 8_192;
const MAX_RUNTIME_CLEANUP_BYTES = 1_024 * 1_024 * 1_024;

function contained(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isRuntimePath(projectRoot, candidate) {
  return contained(projectRoot, candidate) && path.dirname(candidate) === projectRoot &&
    path.basename(candidate).startsWith(RUNTIME_PREFIX);
}

async function assertRuntimeDirectory(directory, projectRoot) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Report runtime directory is unsafe');
  if (await fs.realpath(directory) !== directory || !isRuntimePath(projectRoot, directory)) {
    throw new Error('Report runtime directory escaped the project root');
  }
}

async function boundedSize(directory) {
  const pending = [directory];
  let entriesSeen = 0;
  let bytes = 0;
  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) continue;
      const handle = await fs.opendir(current);
      try {
        for (;;) {
          const entry = await handle.read();
          if (entry === null) break;
          entriesSeen += 1;
          if (entriesSeen > MAX_RUNTIME_SCAN_ENTRIES) return undefined;
          const filename = path.join(current, entry.name);
          const stat = await fs.lstat(filename);
          if (stat.isSymbolicLink()) return undefined;
          if (stat.isDirectory()) {
            if (await fs.realpath(filename) !== filename) return undefined;
            pending.push(filename);
          } else if (stat.isFile()) {
            bytes += stat.size;
            if (bytes > MAX_RUNTIME_CLEANUP_BYTES) return undefined;
          } else {
            return undefined;
          }
        }
      } finally {
        await handle.close();
      }
    }
    return bytes;
  } catch {
    return undefined;
  }
}

async function runtimeOwnerIsActive(directory) {
  const filename = path.join(directory, OWNER_FILENAME);
  let handle;
  try {
    handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 128) return true;
    const [pidText, ownerScript] = (await handle.readFile('utf8')).trim().split('\t', 2);
    const pid = Number(pidText);
    if (!Number.isSafeInteger(pid) || pid < 1) return true;
    try {
      process.kill(pid, 0);
      if (process.platform === 'win32' || ownerScript === undefined) return true;
      try {
        const commandLine = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8');
        return commandLine.includes(ownerScript);
      } catch (error) {
        return (error?.code ?? '') !== 'ENOENT';
      }
    } catch (error) {
      return (error?.code ?? '') === 'EPERM';
    }
  } catch (error) {
    return true;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function pruneStaleRuntimeDirectories(projectRoot) {
  let directory;
  try {
    directory = await fs.opendir(projectRoot);
  } catch {
    return;
  }
  const now = Date.now();
  let inspected = 0;
  let rootEntriesSeen = 0;
  try {
    for (;;) {
      const entry = await directory.read();
      if (entry === null || inspected >= MAX_STALE_RUNTIME_ENTRIES || rootEntriesSeen >= MAX_RUNTIME_ROOT_SCAN_ENTRIES) break;
      rootEntriesSeen += 1;
      if (!entry.name.startsWith(RUNTIME_PREFIX)) continue;
      inspected += 1;
      const candidate = path.join(projectRoot, entry.name);
      try {
        const stat = await fs.lstat(candidate);
        if (!stat.isDirectory() || stat.isSymbolicLink() || now - stat.mtimeMs < STALE_RUNTIME_AGE_MS) continue;
        if (await runtimeOwnerIsActive(candidate)) continue;
        await assertRuntimeDirectory(candidate, projectRoot);
        if (await boundedSize(candidate) === undefined) continue;
        await fs.rm(candidate, { recursive: true, force: false });
      } catch {
        // Preserve anything that is malformed, changed, active, or over budget.
      }
    }
  } finally {
    await directory.close();
  }
}

async function createOwnerMarker(directory) {
  const filename = path.join(directory, OWNER_FILENAME);
  const handle = await fs.open(
    filename,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(`${process.pid}\t${OWNER_SCRIPT}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return filename;
}

function startHeartbeat(filename) {
  const heartbeat = setInterval(async () => {
    try {
      const handle = await fs.open(filename, constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const now = new Date();
        await handle.utimes(now, now);
      } finally {
        await handle.close();
      }
    } catch {
      // Cleanup or stale recovery will preserve the runtime when ownership is uncertain.
    }
  }, RUNTIME_HEARTBEAT_MS);
  heartbeat.unref();
  return () => clearInterval(heartbeat);
}

export async function removeRuntimeDirectory(directory, projectRoot) {
  try {
    await assertRuntimeDirectory(directory, projectRoot);
    if (await boundedSize(directory) === undefined) {
      console.warn('report runtime cleanup skipped: directory is unsafe or over budget');
      return false;
    }
    await fs.rm(directory, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.warn(`report runtime cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function createRuntimeDirectory() {
  const projectRoot = await fs.realpath(PROJECT_ROOT);
  await pruneStaleRuntimeDirectories(projectRoot);
  let directory;
  try {
    directory = await fs.mkdtemp(path.join(projectRoot, RUNTIME_PREFIX));
    await assertRuntimeDirectory(directory, projectRoot);
    const owner = await createOwnerMarker(directory);
    return { projectRoot, directory, stopHeartbeat: startHeartbeat(owner) };
  } catch (error) {
    if (directory !== undefined) await removeRuntimeDirectory(directory, projectRoot);
    throw error;
  }
}
