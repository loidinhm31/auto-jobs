import type { Locator, Page } from '@playwright/test';
import type {
  StageViewRun,
  StageViewStage,
  StageViewStatus,
  StageViewTerminalStatus,
} from './stage-view-types.js';

const STATUS_TOKENS: Record<string, StageViewStatus> = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  UNSTABLE: 'UNSTABLE',
  ABORTED: 'ABORTED',
  'in-progress-run': 'in-progress',
  'in-progress': 'in-progress',
};

export function parseStageViewStatus(classAttr?: string | undefined): StageViewStatus {
  if (!classAttr) return 'unknown';
  const parts = classAttr.split(/\s+/u);
  for (const part of parts) {
    const upper = part.toUpperCase();
    const matched = STATUS_TOKENS[upper] || STATUS_TOKENS[part];
    if (matched) return matched;
  }
  const lower = classAttr.toLowerCase();
  if (lower.includes('progress-bar') || lower.includes('in-progress') || lower.includes('running')) {
    return 'in-progress';
  }
  if (lower.includes('success') || lower.includes('passed')) return 'SUCCESS';
  if (lower.includes('failed') || lower.includes('failure') || lower.includes('error')) return 'FAILED';
  if (lower.includes('unstable')) return 'UNSTABLE';
  if (lower.includes('aborted') || lower.includes('cancelled')) return 'ABORTED';
  if (lower.includes('not_executed') || lower.includes('not-executed') || lower.includes('skipped')) {
    return 'NOT_EXECUTED';
  }
  return 'unknown';
}

export async function readStageNames(page: Page): Promise<string[]> {
  try {
    const headers = page.locator('#pipeline-box table.jobsTable thead th');
    const count = await headers.count();
    const names: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const header = headers.nth(i);
      const cls = (await header.getAttribute('class')) ?? '';
      if (cls.includes('stage-start')) continue;
      const text = (await header.innerText()).trim();
      if (text.length > 0) {
        names.push(text);
      }
    }
    return names;
  } catch {
    return [];
  }
}

export async function parseRunRow(
  row: Locator,
  stageNames: readonly string[],
): Promise<StageViewRun | undefined> {
  try {
    const runIdAttr = await row.getAttribute('data-runid');
    let runId: number | undefined;
    let buildNumber = '';

    if (runIdAttr && !isNaN(Number(runIdAttr))) {
      runId = Number(runIdAttr);
      buildNumber = `#${runId}`;
    }

    const badgeLink = row.locator('.jobName a');
    if ((await badgeLink.count()) > 0) {
      const linkText = (await badgeLink.first().innerText()).trim();
      if (linkText.startsWith('#')) {
        buildNumber = linkText;
        if (runId === undefined) {
          const parsed = Number(linkText.slice(1));
          if (!isNaN(parsed)) runId = parsed;
        }
      }
    }

    if (runId === undefined) return undefined;

    const classAttr = (await row.getAttribute('class')) ?? '';
    const status = parseStageViewStatus(classAttr);

    const stages: StageViewStage[] = [];
    const stageCells = row.locator('td.stage-cell');
    const cellCount = await stageCells.count();

    for (let c = 0; c < cellCount; c += 1) {
      const cell = stageCells.nth(c);
      const cellClass = (await cell.getAttribute('class')) ?? '';
      let cellStatus = parseStageViewStatus(cellClass);
      if (cellStatus === 'unknown') {
        const popover = cell.locator('.stage-actions-popover');
        if ((await popover.count()) > 0) {
          const caption = (await popover.first().getAttribute('caption')) ?? '';
          const parsedCaption = parseStageViewStatus(caption);
          if (parsedCaption !== 'unknown') {
            cellStatus = parsedCaption;
          }
        }
      }
      let duration: string | undefined;
      const durationLocator = cell.locator('.duration');
      if ((await durationLocator.count()) > 0) {
        duration = (await durationLocator.first().innerText()).trim();
      }
      if (cellStatus === 'unknown' && duration && duration.length > 0 && !duration.startsWith('0m')) {
        cellStatus = 'SUCCESS';
      }

      stages.push({
        index: c,
        name: stageNames[c] ?? `Stage ${c + 1}`,
        status: cellStatus === 'unknown' && cellClass.includes('NOT_EXECUTED') ? 'NOT_EXECUTED' : cellStatus,
        duration: duration && duration.length > 0 ? duration : undefined,
      });
    }

    return {
      runId,
      buildNumber,
      status,
      stages,
    };
  } catch {
    return undefined;
  }
}

export async function getLatestStageViewRun(
  page: Page,
  stageNames?: readonly string[],
): Promise<StageViewRun | undefined> {
  const rows = page.locator('#pipeline-box table.jobsTable tbody tr.job');
  const count = await rows.count();
  if (count === 0) return undefined;

  const resolvedStageNames = stageNames ?? (await readStageNames(page));
  return parseRunRow(rows.first(), resolvedStageNames);
}

export function evaluateRunCompletion(run: StageViewRun): {
  readonly completed: boolean;
  readonly finalStatus?: StageViewTerminalStatus | undefined;
} {
  const rowStatus = run.status.toUpperCase();
  if (rowStatus === 'SUCCESS' || rowStatus === 'FAILED' || rowStatus === 'UNSTABLE' || rowStatus === 'ABORTED') {
    return { completed: true, finalStatus: rowStatus as StageViewTerminalStatus };
  }

  if (run.status === 'in-progress') {
    return { completed: false };
  }

  if (run.stages.length > 0) {
    const hasInProgress = run.stages.some((s) => s.status === 'in-progress');
    if (hasInProgress) {
      return { completed: false };
    }

    const executed = run.stages.filter((s) => s.status !== 'NOT_EXECUTED' && s.status !== 'unknown');
    if (executed.length > 0) {
      if (executed.some((s) => s.status === 'FAILED')) {
        return { completed: true, finalStatus: 'FAILED' };
      }
      if (executed.some((s) => s.status === 'UNSTABLE')) {
        return { completed: true, finalStatus: 'UNSTABLE' };
      }
      if (executed.some((s) => s.status === 'ABORTED')) {
        return { completed: true, finalStatus: 'ABORTED' };
      }
      if (executed.every((s) => s.status === 'SUCCESS')) {
        return { completed: true, finalStatus: 'SUCCESS' };
      }
    }
  }

  return { completed: false };
}

export function parseJenkinsDurationMs(str?: string | undefined): number {
  if (!str) return 0;
  let totalMs = 0;
  const clean = str.trim().toLowerCase().replace(/^~/, '').trim();
  const msMatch = clean.match(/(\d+)\s*ms/);
  if (msMatch && msMatch[1]) totalMs += parseInt(msMatch[1], 10);
  const sMatch = clean.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?(?![a-z])/);
  if (sMatch && sMatch[1]) totalMs += Math.round(parseFloat(sMatch[1]) * 1000);
  const mMatch = clean.match(/(\d+)\s*m(?:in(?:utes?)?)?(?![a-z])/);
  if (mMatch && mMatch[1]) totalMs += parseInt(mMatch[1], 10) * 60 * 1000;
  const hMatch = clean.match(/(\d+)\s*h(?:ours?)?(?![a-z])/);
  if (hMatch && hMatch[1]) totalMs += parseInt(hMatch[1], 10) * 3600 * 1000;
  return totalMs;
}

export function formatDurationHuman(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function calculateRunDurationMs(run: StageViewRun): number {
  let totalMs = 0;
  for (const stage of run.stages) {
    if (stage.duration) {
      totalMs += parseJenkinsDurationMs(stage.duration);
    }
  }
  return totalMs;
}

export async function estimateBuildTimeoutMs(
  page: Page,
  latestRun?: StageViewRun | undefined,
  defaultTimeoutMs = 900_000,
): Promise<{ timeoutMs: number; source: 'last-build' | 'average-totals' | 'default'; estimatedDurationMs: number }> {
  if (latestRun !== undefined && (latestRun.status === 'SUCCESS' || latestRun.status === 'FAILED')) {
    const durationMs = calculateRunDurationMs(latestRun);
    if (durationMs > 0) {
      const timeoutMs = Math.max(300_000, Math.round(durationMs * 1.5) + 180_000);
      return { timeoutMs, source: 'last-build', estimatedDurationMs: durationMs };
    }
  }

  try {
    const totalsTextLocator = page.locator('#pipeline-box .totals td.stage-start .cell-color');
    if ((await totalsTextLocator.count()) > 0) {
      const text = await totalsTextLocator.first().innerText();
      const match = /full\s*run\s*time:\s*~?([^)<]+)/i.exec(text);
      if (match && match[1]) {
        const durationMs = parseJenkinsDurationMs(match[1]);
        if (durationMs > 0) {
          const timeoutMs = Math.max(300_000, Math.round(durationMs * 1.5) + 180_000);
          return { timeoutMs, source: 'average-totals', estimatedDurationMs: durationMs };
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  return { timeoutMs: defaultTimeoutMs, source: 'default', estimatedDurationMs: 0 };
}
