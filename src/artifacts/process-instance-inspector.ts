import { execFile } from 'node:child_process';

const MAX_INSPECTOR_OUTPUT_BYTES = 1_024;
const INSPECTOR_TIMEOUT_MS = 2_000;
const PROCESS_STARTED_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{7})Z$/u;

export type ProcessInspection =
  | { readonly state: 'dead' }
  | { readonly state: 'live'; readonly startedAt?: string }
  | { readonly state: 'unknown' };

export type ProcessInstanceInspector = (pid: number) => Promise<ProcessInspection>;

export function isValidProcessStartedAt(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = PROCESS_STARTED_AT.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number(match[7]?.slice(0, 3));
  if (year < 1601 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  return Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute && date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === milliseconds;
}

export function parseProcessInspectionOutput(output: string): ProcessInspection {
  if (Buffer.byteLength(output, 'utf8') > MAX_INSPECTOR_OUTPUT_BYTES) return { state: 'unknown' };
  const lines = output.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== 1) return { state: 'unknown' };
  if (lines[0] === 'DEAD') return { state: 'dead' };
  const match = /^LIVE\|(.+)$/u.exec(lines[0] ?? '');
  return match !== null && isValidProcessStartedAt(match[1]) && match[1] !== undefined
    ? { state: 'live', startedAt: match[1] }
    : { state: 'unknown' };
}

function inspectWithNode(pid: number): ProcessInspection {
  try {
    process.kill(pid, 0);
    return { state: 'live' };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
      ? { state: 'dead' }
      : { state: 'unknown' };
  }
}

function inspectWithPowerShell(pid: number): Promise<ProcessInspection> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$items = @(Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}')`,
    "if ($items.Count -eq 0) { 'DEAD'; exit 0 }",
    "if ($items.Count -ne 1 -or $null -eq $items[0].CreationDate) { exit 1 }",
    "'LIVE|' + $items[0].CreationDate.ToUniversalTime().ToString('o')",
  ].join('; ');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { shell: false, windowsHide: true, timeout: INSPECTOR_TIMEOUT_MS, maxBuffer: MAX_INSPECTOR_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error !== null || stderr.length > 0) {
          resolve({ state: 'unknown' });
          return;
        }
        resolve(parseProcessInspectionOutput(stdout));
      },
    );
  });
}

export const inspectProcessInstance: ProcessInstanceInspector = async (pid) => {
  if (!Number.isSafeInteger(pid) || pid < 1) return { state: 'unknown' };
  return process.platform === 'win32' ? inspectWithPowerShell(pid) : inspectWithNode(pid);
};