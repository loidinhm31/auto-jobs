import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { AggregateReportResult } from '../result-types.js';
import { writeAggregateReportFile } from '../reporting/report-output.js';

async function writeTemporary(directory: string, contents: string): Promise<string> {
  const temporary = path.join(directory, `.tmp-${crypto.randomBytes(8).toString('hex')}`);
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function moveIfPresent(source: string, destination: string): Promise<boolean> {
  try {
    await fs.rename(source, destination);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function removeIfPresent(filename: string): Promise<void> {
  try {
    await fs.unlink(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function recordRollbackStep(
  label: string,
  action: () => Promise<void>,
  errors: string[],
): Promise<void> {
  try {
    await action();
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeAggregateDataPair(
  reportRoot: string,
  aggregate: AggregateReportResult,
): Promise<string> {
  const dataPath = path.join(reportRoot, 'aggregate-data.json');
  const reportPath = path.join(reportRoot, 'index.html');
  const stagedData = await writeTemporary(reportRoot, `${JSON.stringify(aggregate, null, 2)}\n`);
  const stagedReport = path.join(reportRoot, `.tmp-aggregate-${crypto.randomBytes(8).toString('hex')}.html`);
  const backupData = path.join(reportRoot, `.bak-aggregate-data-${crypto.randomBytes(8).toString('hex')}`);
  const backupReport = path.join(reportRoot, `.bak-aggregate-report-${crypto.randomBytes(8).toString('hex')}`);
  let dataBackedUp = false;
  let reportBackedUp = false;
  let dataPublished = false;
  let reportPublished = false;
  let dataRestored = false;
  let reportRestored = false;
  try {
    await writeAggregateReportFile(reportRoot, aggregate, stagedReport);
    try {
      dataBackedUp = await moveIfPresent(dataPath, backupData);
      reportBackedUp = await moveIfPresent(reportPath, backupReport);
      await fs.rename(stagedData, dataPath);
      dataPublished = true;
      await fs.rename(stagedReport, reportPath);
      reportPublished = true;
      return dataPath;
    } catch (error) {
      const rollbackErrors: string[] = [];
      if (dataPublished) await recordRollbackStep('remove new aggregate data', () => removeIfPresent(dataPath), rollbackErrors);
      if (reportPublished) await recordRollbackStep('remove new aggregate report', () => removeIfPresent(reportPath), rollbackErrors);
      if (dataBackedUp) {
        await recordRollbackStep('restore aggregate data', async () => {
          await fs.rename(backupData, dataPath);
          dataRestored = true;
        }, rollbackErrors);
      }
      if (reportBackedUp) {
        await recordRollbackStep('restore aggregate report', async () => {
          await fs.rename(backupReport, reportPath);
          reportRestored = true;
        }, rollbackErrors);
      }
      if (rollbackErrors.length > 0) {
        const original = error instanceof Error ? error.message : String(error);
        throw new Error(`aggregate publication failed: ${original}; rollback incomplete: ${rollbackErrors.join('; ')}`);
      }
      throw error;
    }
  } finally {
    await fs.unlink(stagedData).catch(() => undefined);
    await fs.unlink(stagedReport).catch(() => undefined);
    if (!dataBackedUp || dataRestored) await fs.unlink(backupData).catch(() => undefined);
    if (!reportBackedUp || reportRestored) await fs.unlink(backupReport).catch(() => undefined);
  }
}
