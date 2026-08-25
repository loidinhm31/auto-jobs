import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { ProjectFailureResultV2, ProjectRunManifest } from '../artifacts/artifact-manifest.js';
import type { AggregateReportResult, VulnerabilityReportResultV2 } from '../result-types.js';
import { renderAggregateReport } from './aggregate-report-renderer.js';
import { renderProjectReport } from './project-report-renderer.js';
import { createProjectReportViewModel } from './report-view-model.js';

type ProjectResult = VulnerabilityReportResultV2 | ProjectFailureResultV2;

const stylesheetUrl = new URL('./report.css', import.meta.url);

async function writeTemporary(directory: string, contents: string): Promise<string> {
  const temporary = path.join(directory, `.tmp-report-${crypto.randomBytes(8).toString('hex')}`);
  const handle = await fsp.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function writeAtomic(
  filename: string,
  contents: string,
  replace: boolean,
): Promise<void> {
  const temporary = await writeTemporary(path.dirname(filename), contents);
  try {
    if (replace) {
      await fsp.rename(temporary, filename);
    } else {
      await fsp.link(temporary, filename);
    }
  } finally {
    await fsp.unlink(temporary).catch(() => undefined);
  }
}

async function readStylesheet(): Promise<string> {
  try {
    return await fsp.readFile(stylesheetUrl, 'utf8');
  } catch {
    return fsp.readFile(path.resolve('src/reporting/report.css'), 'utf8');
  }
}

async function ensureStylesheet(reportRoot: string): Promise<void> {
  const assets = path.join(reportRoot, 'assets');
  await fsp.mkdir(assets, { recursive: true, mode: 0o700 });
  const stat = await fsp.lstat(assets);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Report assets directory is unsafe');
  const filename = path.join(assets, 'report.css');
  try {
    const existing = await fsp.lstat(filename);
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('Report stylesheet is unsafe');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeAtomic(filename, await readStylesheet(), true);
}

function defaultReportRoot(directory: string): string {
  return path.resolve(directory, '../../../');
}

export async function writeProjectReportFiles(
  directory: string,
  result: ProjectResult,
  manifest: ProjectRunManifest,
  reportRoot = defaultReportRoot(directory),
  filename = path.join(directory, 'index.html'),
): Promise<string> {
  await ensureStylesheet(reportRoot);
  const model = createProjectReportViewModel(result, manifest);
  await writeAtomic(filename, renderProjectReport(model), false);
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
