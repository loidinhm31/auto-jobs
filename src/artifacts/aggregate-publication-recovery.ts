import { constants } from 'node:fs';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const JOURNAL = /^\.aggregate-publication-[a-f\d]{16}\.json$/u;
const DATA_TEMP = /^\.tmp-[a-f\d]{16}$/u;
const REPORT_TEMP = /^\.tmp-aggregate-[a-f\d]{16}\.html$/u;
const DATA_BACKUP = /^\.bak-aggregate-data-[a-f\d]{16}$/u;
const REPORT_BACKUP = /^\.bak-aggregate-report-[a-f\d]{16}$/u;
const MAX_JOURNALS = 8;
const MAX_ROOT_ENTRIES = 4_096;
const MAX_JOURNAL_BYTES = 4_096;

export interface AggregatePublicationJournal {
  readonly schemaVersion: 1;
  readonly committed: boolean;
  readonly hadData: boolean;
  readonly hadReport: boolean;
  readonly stagedData: string;
  readonly stagedReport: string;
  readonly backupData: string;
  readonly backupReport: string;
}

function safePath(root: string, filename: string): string {
  const resolved = path.resolve(root, filename);
  if (path.dirname(resolved) !== path.resolve(root)) throw new Error('aggregate recovery path escaped report root');
  return resolved;
}

async function writeAtomic(filename: string, contents: string): Promise<void> {
  const temporary = path.join(path.dirname(filename), `.tmp-journal-${crypto.randomBytes(8).toString('hex')}`);
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(contents, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temporary, filename); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
}

function assertJournal(value: unknown): AggregatePublicationJournal {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('aggregate publication journal is malformed');
  const journal = value as Record<string, unknown>;
  if (journal.schemaVersion !== 1 || typeof journal.committed !== 'boolean' || typeof journal.hadData !== 'boolean' ||
    typeof journal.hadReport !== 'boolean' || typeof journal.stagedData !== 'string' || !DATA_TEMP.test(journal.stagedData) ||
    typeof journal.stagedReport !== 'string' || !REPORT_TEMP.test(journal.stagedReport) || typeof journal.backupData !== 'string' ||
    !DATA_BACKUP.test(journal.backupData) || typeof journal.backupReport !== 'string' || !REPORT_BACKUP.test(journal.backupReport)) {
    throw new Error('aggregate publication journal is malformed');
  }
  return journal as unknown as AggregatePublicationJournal;
}

async function readJournal(filename: string): Promise<AggregatePublicationJournal> {
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_JOURNAL_BYTES) throw new Error('aggregate publication journal is unsafe');
    return assertJournal(JSON.parse(await handle.readFile('utf8')));
  } finally { await handle.close(); }
}

async function existsRegular(filename: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('aggregate recovery entry is unsafe');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function removeRegular(filename: string): Promise<void> {
  if (await existsRegular(filename)) await fs.unlink(filename);
}

async function restoreTarget(target: string, backup: string, hadOriginal: boolean): Promise<void> {
  if (await existsRegular(backup)) {
    await removeRegular(target);
    await fs.rename(backup, target);
  } else if (!hadOriginal) await removeRegular(target);
}

export async function writeAggregatePublicationJournal(filename: string, journal: AggregatePublicationJournal): Promise<void> {
  assertJournal(journal);
  await writeAtomic(filename, `${JSON.stringify(journal)}\n`);
}

export async function recoverAggregatePublication(reportRoot: string): Promise<void> {
  const root = path.resolve(reportRoot);
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await fs.realpath(root) !== root) throw new Error('aggregate recovery root is not canonical');
  const handle = await fs.opendir(root);
  const journals: string[] = [];
  try {
    let inspected = 0;
    for await (const entry of handle) {
      inspected += 1;
      if (inspected > MAX_ROOT_ENTRIES) throw new Error('aggregate recovery entry budget exceeded');
      if (JOURNAL.test(entry.name)) {
        if (entry.isSymbolicLink() || !entry.isFile() || journals.length >= MAX_JOURNALS) throw new Error('aggregate recovery journal inventory is unsafe');
        journals.push(entry.name);
      }
    }
  } finally { await handle.close().catch(() => undefined); }
  for (const name of journals) {
    const journalPath = safePath(root, name);
    const journal = await readJournal(journalPath);
    const data = safePath(root, 'aggregate-data.json');
    const report = safePath(root, 'index.html');
    const stagedData = safePath(root, journal.stagedData);
    const stagedReport = safePath(root, journal.stagedReport);
    const backupData = safePath(root, journal.backupData);
    const backupReport = safePath(root, journal.backupReport);
    if (journal.committed) {
      await removeRegular(stagedData); await removeRegular(stagedReport);
      await removeRegular(backupData); await removeRegular(backupReport);
    } else {
      await restoreTarget(data, backupData, journal.hadData);
      await restoreTarget(report, backupReport, journal.hadReport);
      await removeRegular(stagedData); await removeRegular(stagedReport);
      await removeRegular(backupData); await removeRegular(backupReport);
    }
    await fs.unlink(journalPath);
  }
}
