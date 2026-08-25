import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { AggregateReportResult } from '../result-types.js';
import { writeAggregateReportFile } from '../reporting/report-output.js';
import {
  type AggregatePublicationJournal,
  recoverAggregatePublication,
  writeAggregatePublicationJournal,
} from './aggregate-publication-recovery.js';

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

async function regularPresent(filename: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('aggregate publication target is unsafe');
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
  const journalPath = path.join(reportRoot, `.aggregate-publication-${crypto.randomBytes(8).toString('hex')}.json`);
  const journal: AggregatePublicationJournal = {
    schemaVersion: 1,
    committed: false,
    hadData: await regularPresent(dataPath),
    hadReport: await regularPresent(reportPath),
    stagedData: path.basename(stagedData),
    stagedReport: path.basename(stagedReport),
    backupData: path.basename(backupData),
    backupReport: path.basename(backupReport),
  };
  let dataBackedUp = false;
  let reportBackedUp = false;
  let dataPublished = false;
  let reportPublished = false;
  let dataRestored = false;
  let reportRestored = false;
  let journalWritten = false;
  let recoveryRequired = false;
  try {
    await writeAggregateReportFile(reportRoot, aggregate, stagedReport);
    await writeAggregatePublicationJournal(journalPath, journal);
    journalWritten = true;
    try {
      dataBackedUp = await moveIfPresent(dataPath, backupData);
      reportBackedUp = await moveIfPresent(reportPath, backupReport);
      await fs.rename(stagedData, dataPath);
      dataPublished = true;
      await fs.rename(stagedReport, reportPath);
      reportPublished = true;
      await writeAggregatePublicationJournal(journalPath, { ...journal, committed: true });
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
        recoveryRequired = true;
        const original = error instanceof Error ? error.message : String(error);
        throw new Error(`aggregate publication failed: ${original}; rollback incomplete: ${rollbackErrors.join('; ')}`);
      }
      throw error;
    }
  } finally {
    if (!recoveryRequired) {
      if (journalWritten) await fs.unlink(journalPath).catch(() => undefined);
      await fs.unlink(stagedData).catch(() => undefined);
      await fs.unlink(stagedReport).catch(() => undefined);
      if (!dataBackedUp || dataRestored) await fs.unlink(backupData).catch(() => undefined);
      if (!reportBackedUp || reportRestored) await fs.unlink(backupReport).catch(() => undefined);
    }
  }
}
