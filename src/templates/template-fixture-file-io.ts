import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FileIdentity, TemplateReadBudget } from './template-fixture-types.js';

export const MAX_TEMPLATE_BYTES = 4 * 1_048_576;
export const MAX_TEMPLATE_TOTAL_BYTES = 16 * 1_048_576;
export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function descriptorPath(fileDescriptor: number): Promise<string> {
  return fs.realpath(path.join('/proc/self/fd', String(fileDescriptor)));
}

export function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.ino === right.ino && (left.dev === right.dev || left.dev === 0 || right.dev === 0);
}

export async function windowsPathIsSafe(
  root: string,
  filename: string,
  handle?: fs.FileHandle,
): Promise<boolean> {
  try {
    let current = path.parse(filename).root;
    for (const segment of path.relative(current, filename).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if ((await fs.lstat(current)).isSymbolicLink()) return false;
    }
    const canonicalRoot = await fs.realpath(root);
    const canonicalFilename = await fs.realpath(filename);
    const relative = path.relative(canonicalRoot, canonicalFilename);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    if (handle !== undefined) {
      const [pathStat, handleStat] = await Promise.all([fs.stat(filename), handle.stat()]);
      if (
        pathStat.ino !== handleStat.ino ||
        (pathStat.dev !== 0 && handleStat.dev !== 0 && pathStat.dev !== handleStat.dev)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function readTemplate(
  root: string,
  relativePath: string,
  expectedRootIdentity: FileIdentity,
  budget: TemplateReadBudget,
): Promise<string> {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Template path escapes the configured template root');
  }
  const rootHandle = await fs.open(
    root,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    const openedRoot = process.platform === 'win32' ? root : await descriptorPath(rootHandle.fd);
    if (openedRoot !== root) throw new Error('Template root changed while it was being opened');
    if (
      process.platform === 'win32' &&
      (!(await windowsPathIsSafe(root, root)) ||
        !(await windowsPathIsSafe(root, root, rootHandle)) ||
        !sameIdentity(await rootHandle.stat(), expectedRootIdentity))
    ) {
      throw new Error('Template root changed while it was being opened');
    }
    if (process.platform === 'win32' && !(await windowsPathIsSafe(root, target))) {
      throw new Error(`Template source contains an unsafe path: ${relativePath}`);
    }
    const templateHandle = await fs.open(
      process.platform === 'win32' ? target : path.join('/proc/self/fd', String(rootHandle.fd), relativePath),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      const stat = await templateHandle.stat();
      const expectedPath = path.resolve(openedRoot, relativePath);
      if (process.platform === 'win32') {
        if (
          !(await windowsPathIsSafe(root, root, rootHandle)) ||
          !sameIdentity(await rootHandle.stat(), expectedRootIdentity) ||
          !(await windowsPathIsSafe(root, target, templateHandle))
        ) {
          throw new Error(`Template source contains an unsafe path: ${relativePath}`);
        }
      } else if ((await descriptorPath(templateHandle.fd)) !== expectedPath) {
        throw new Error(`Template source contains an unsafe path: ${relativePath}`);
      }
      const nextBytes = budget.bytes + stat.size;
      if (!stat.isFile() || stat.size > MAX_TEMPLATE_BYTES || nextBytes > MAX_TEMPLATE_TOTAL_BYTES) {
        throw new Error(`Template source is not a regular file under the per-file and total fixture budgets: ${relativePath}`);
      }
      budget.bytes = nextBytes;
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const read = await templateHandle.read(bytes, offset, bytes.byteLength - offset, offset);
        if (read.bytesRead === 0) throw new Error(`Template source changed while it was being read: ${relativePath}`);
        offset += read.bytesRead;
      }
      return bytes.toString('utf8');
    } finally {
      await templateHandle.close();
    }
  } finally {
    await rootHandle.close();
  }
}

export async function resolveTemplateRoot(
  env: NodeJS.ProcessEnv,
): Promise<{ root: string; rootIdentity: FileIdentity }> {
  const configuredRoot = env['TEMPLATES_DIR']?.trim() || path.join(REPOSITORY_ROOT, 'templates');
  const configuredRootPath = path.resolve(configuredRoot);
  const configuredRootStat = await fs.lstat(configuredRootPath);
  const canonicalRoot = await fs.realpath(configuredRootPath);
  const rootStat = await fs.stat(canonicalRoot);
  const rootIsSafe = process.platform === 'win32'
    ? await windowsPathIsSafe(canonicalRoot, configuredRootPath)
    : canonicalRoot === configuredRootPath;
  if (!configuredRootStat.isDirectory() || configuredRootStat.isSymbolicLink() || !rootIsSafe) {
    throw new Error('Template root must be a real directory without symbolic-link components');
  }
  return {
    root: canonicalRoot,
    rootIdentity: { dev: rootStat.dev, ino: rootStat.ino },
  };
}
