import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { ProjectFailureResultV3, ProjectRunManifest } from '../artifacts/artifact-manifest.js';
import type { AggregateReportResult, VulnerabilityReportResultV3 } from '../result-types.js';
import { renderAggregateReport } from './aggregate-report-renderer.js';
import { renderProjectReport } from './project-report-renderer.js';
import { createProjectReportViewModel } from './report-view-model.js';
import { withWorkflowDeadline, type WorkflowDeadline } from '../workflow/workflow-deadline.js';

type ProjectResult = VulnerabilityReportResultV3 | ProjectFailureResultV3;

const stylesheetUrl = new URL('./report.css', import.meta.url);
function requireDeadline(deadline?: WorkflowDeadline): void {
  deadline?.requireRemaining();
}

async function bounded<T>(operation: () => Promise<T>, deadline?: WorkflowDeadline): Promise<T> {
  return deadline === undefined ? operation() : withWorkflowDeadline(operation, deadline);
}

async function cleanupWithinRemaining<T>(operation: () => Promise<T>, deadline?: WorkflowDeadline): Promise<T> {
  if (deadline === undefined) return operation();
  const timeoutMs = Math.max(1, deadline.remainingMs());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('report output cleanup exceeded workflow deadline')), timeoutMs);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}


async function writeTemporary(directory: string, contents: string, deadline?: WorkflowDeadline): Promise<string> {
  requireDeadline(deadline);
  const temporary = path.join(directory, `.tmp-report-${crypto.randomBytes(8).toString('hex')}`);
  const handle = await bounded(() => fsp.open(temporary, 'wx', 0o600), deadline);
  try {
    await bounded(() => handle.writeFile(contents, 'utf8'), deadline);
    await bounded(() => handle.sync(), deadline);
    requireDeadline(deadline);
  } finally {
    await cleanupWithinRemaining(() => handle.close(), deadline).catch(() => undefined);
  }
  return temporary;
}

async function writeAtomic(
  filename: string,
  contents: string,
  replace: boolean,
  deadline?: WorkflowDeadline,
): Promise<void> {
  requireDeadline(deadline);
  const temporary = await writeTemporary(path.dirname(filename), contents, deadline);
  try {
    requireDeadline(deadline);
    if (replace) {
      await bounded(() => fsp.rename(temporary, filename), deadline);
    } else {
      await bounded(() => fsp.link(temporary, filename), deadline);
    }
    requireDeadline(deadline);
  } finally {
    await cleanupWithinRemaining(() => fsp.unlink(temporary), deadline).catch(() => undefined);
  }
}

async function readStylesheet(deadline?: WorkflowDeadline): Promise<string> {
  requireDeadline(deadline);
  let stylesheet: string;
  try {
    stylesheet = await bounded(() => fsp.readFile(stylesheetUrl, 'utf8'), deadline);
  } catch {
    stylesheet = await bounded(() => fsp.readFile(path.resolve('src/reporting/report.css'), 'utf8'), deadline);
  }
  requireDeadline(deadline);
  return stylesheet;
}

async function ensureStylesheet(reportRoot: string, deadline?: WorkflowDeadline): Promise<void> {
  requireDeadline(deadline);
  const assets = path.join(reportRoot, 'assets');
  await bounded(() => fsp.mkdir(assets, { recursive: true, mode: 0o700 }), deadline);
  requireDeadline(deadline);
  const stat = await bounded(() => fsp.lstat(assets), deadline);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Report assets directory is unsafe');
  const filename = path.join(assets, 'report.css');
  try {
    const existing = await bounded(() => fsp.lstat(filename), deadline);
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('Report stylesheet is unsafe');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  requireDeadline(deadline);
  await writeAtomic(filename, await readStylesheet(deadline), true, deadline);
}

function defaultReportRoot(directory: string): string {
  return path.resolve(directory, '../../');
}

export async function writeProjectReportFiles(
  directory: string,
  result: ProjectResult,
  manifest: ProjectRunManifest,
  reportRoot = defaultReportRoot(directory),
  filename = path.join(directory, 'index.html'),
  deadline?: WorkflowDeadline,
): Promise<string> {
  await ensureStylesheet(reportRoot, deadline);
  requireDeadline(deadline);
  const model = createProjectReportViewModel(result, manifest);
  await writeAtomic(filename, renderProjectReport(model), false, deadline);
  requireDeadline(deadline);
  return filename;
}

export async function writeAggregateReportFile(
  reportRoot: string,
  aggregate: AggregateReportResult,
  filename = path.join(reportRoot, 'index.html'),
): Promise<string> {
  await ensureStylesheet(reportRoot);
  await writeAtomic(filename, renderAggregateReport(aggregate), true);
  return filename;
}

export function reportFileExists(filename: string): boolean {
  try {
    return fs.statSync(filename).isFile();
  } catch {
    return false;
  }
}
