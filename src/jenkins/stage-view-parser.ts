import type { Locator, Page } from '@playwright/test';
import type { StageViewRun, StageViewStage, StageViewStatus } from './stage-view-types.js';

const STATUS_TOKENS: Record<string, StageViewStatus> = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  UNSTABLE: 'UNSTABLE',
  ABORTED: 'ABORTED',
  'in-progress-run': 'in-progress',
  'in-progress': 'in-progress',
};

export function parseStageViewStatus(classAttr: string): StageViewStatus {
  const parts = classAttr.split(/\s+/u);
  for (const part of parts) {
    const matched = STATUS_TOKENS[part];
    if (matched) return matched;
  }
  if (classAttr.includes('progress-bar')) {
    return 'in-progress';
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
      const cellStatus = parseStageViewStatus(cellClass);
      let duration: string | undefined;
      const durationLocator = cell.locator('.duration');
      if ((await durationLocator.count()) > 0) {
        duration = (await durationLocator.first().innerText()).trim();
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
