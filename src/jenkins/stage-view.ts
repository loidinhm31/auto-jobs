import type { Page } from '@playwright/test';
import type { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import {
  getLatestStageViewRun,
  parseRunRow,
  parseStageViewStatus,
  readStageNames,
} from './stage-view-parser.js';
import type {
  StageViewCompletionResult,
  StageViewRun,
  StageViewStage,
  StageViewStatus,
  StageViewTerminalStatus,
  WaitForStageViewOptions,
} from './stage-view-types.js';

export type {
  StageViewCompletionResult,
  StageViewRun,
  StageViewStage,
  StageViewStatus,
  StageViewTerminalStatus,
  WaitForStageViewOptions,
};
export { getLatestStageViewRun, parseRunRow, parseStageViewStatus, readStageNames };

export async function waitForStageViewCompletion(
  page: Page,
  previousRunId: number | undefined,
  deadline: WorkflowDeadline,
  options: WaitForStageViewOptions = {},
): Promise<StageViewCompletionResult> {
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const reloadIntervalMs = options.reloadIntervalMs ?? 10_000;
  const onProgress = options.onProgress;

  onProgress?.('[Stage View] Connecting to Stage View on job page...');

  try {
    const stageViewLocator = page.locator('#pipeline-box');
    const waitTimeout = Math.max(1_000, Math.min(deadline.remainingMs(), 15_000));
    await stageViewLocator.waitFor({ state: 'visible', timeout: waitTimeout });
  } catch (error) {
    return {
      completed: false,
      error: `Stage View container (#pipeline-box) not visible within deadline: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const stageNames = await readStageNames(page);
  let targetRun: StageViewRun | undefined;
  let lastReloadTime = Date.now();
  let hasLoggedQueueWait = false;
  const loggedStageStates = new Map<number, string>();

  while (deadline.remainingMs() > 0) {
    const rows = page.locator('#pipeline-box table.jobsTable tbody tr.job');
    const rowCount = await rows.count();

    if (targetRun === undefined) {
      for (let i = 0; i < rowCount; i += 1) {
        const parsed = await parseRunRow(rows.nth(i), stageNames);
        if (parsed !== undefined) {
          const isNewer = previousRunId !== undefined && parsed.runId > previousRunId;
          const isFreshInProgress = previousRunId === undefined && parsed.status === 'in-progress';
          if (isNewer || isFreshInProgress) {
            targetRun = parsed;
            onProgress?.(`[Stage View] Detected build ${targetRun.buildNumber} (status: ${targetRun.status})`);
            break;
          }
        }
      }
    } else {
      for (let i = 0; i < rowCount; i += 1) {
        const parsed = await parseRunRow(rows.nth(i), stageNames);
        if (parsed !== undefined && parsed.runId === targetRun.runId) {
          targetRun = parsed;
          break;
        }
      }
    }

    if (targetRun !== undefined) {
      for (const stage of targetRun.stages) {
        const stageKey = stage.index;
        const currentDescriptor = `${stage.status}|${stage.duration ?? ''}`;
        const previousDescriptor = loggedStageStates.get(stageKey);
        if (previousDescriptor !== currentDescriptor) {
          loggedStageStates.set(stageKey, currentDescriptor);
          const dur = stage.duration ? ` in ${stage.duration}` : '';
          onProgress?.(`[Stage View] ${targetRun.buildNumber} Stage '${stage.name}': ${stage.status}${dur}`);
        }
      }

      const st = targetRun.status;
      if (st === 'SUCCESS' || st === 'FAILED' || st === 'UNSTABLE' || st === 'ABORTED') {
        onProgress?.(`[Stage View] Build ${targetRun.buildNumber} finished with result: ${st}`);
        return {
          completed: true,
          run: targetRun,
        };
      }
    } else if (!hasLoggedQueueWait) {
      hasLoggedQueueWait = true;
      onProgress?.('[Stage View] Waiting for newly triggered build to appear in Stage View table...');
    }

    const remaining = deadline.remainingMs();
    if (remaining <= 0) break;

    const waitTime = Math.min(pollIntervalMs, remaining);
    await page.waitForTimeout(waitTime);

    if (Date.now() - lastReloadTime >= reloadIntervalMs && deadline.remainingMs() > 5_000) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        lastReloadTime = Date.now();
      } catch {
        // Retry next poll on reload failure
      }
    }
  }

  if (targetRun !== undefined) {
    return {
      completed: false,
      run: targetRun,
      error: `Timed out waiting for Stage View build ${targetRun.buildNumber} to reach terminal status`,
    };
  }

  return {
    completed: false,
    error: 'Timed out waiting for new build run to appear in Stage View',
  };
}
