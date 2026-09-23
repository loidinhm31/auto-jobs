import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

import {
  getLatestStageViewRun,
  parseStageViewStatus,
  readStageNames,
  waitForStageViewCompletion,
} from '../../src/jenkins/stage-view.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function close(server: Server): Promise<void> {
  if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test.describe('stage-view parsing and status evaluation', () => {
  test('parseStageViewStatus extracts expected statuses from class tokens', () => {
    expect(parseStageViewStatus('job SUCCESS other')).toBe('SUCCESS');
    expect(parseStageViewStatus('job FAILED')).toBe('FAILED');
    expect(parseStageViewStatus('job UNSTABLE')).toBe('UNSTABLE');
    expect(parseStageViewStatus('job ABORTED')).toBe('ABORTED');
    expect(parseStageViewStatus('job in-progress-run')).toBe('in-progress');
    expect(parseStageViewStatus('job progress-bar-animated')).toBe('in-progress');
    expect(parseStageViewStatus('job unknown-class')).toBe('unknown');
  });

  const SAMPLE_STAGE_VIEW_HTML = `<!doctype html>
<html>
<body>
  <div id="pipeline-box">
    <h2>Stage View</h2>
    <div class="table-box">
      <table class="jobsTable">
        <thead>
          <tr class="header">
            <th class="stage-start"></th>
            <th class="stage-header-name-0">SCM Checkout</th>
            <th class="stage-header-name-1">Build: Maven</th>
            <th class="stage-header-name-2">SAST: SonarQube</th>
          </tr>
        </thead>
        <tbody class="tobsTable-body">
          <tr class="job SUCCESS" data-runid="21">
            <td class="stage-start">
              <div class="cell-box">
                <div class="jobName"><span class="badge"><a href="/job/service/21/">#21</a></span></div>
              </div>
            </td>
            <td class="stage-cell stage-cell-0 SUCCESS" data-stageid="10">
              <div class="duration">8s</div>
            </td>
            <td class="stage-cell stage-cell-1 SUCCESS" data-stageid="22">
              <div class="duration">1min 19s</div>
            </td>
            <td class="stage-cell stage-cell-2 SUCCESS" data-stageid="34">
              <div class="duration">54s</div>
            </td>
          </tr>
          <tr class="job FAILED" data-runid="20">
            <td class="stage-start">
              <div class="cell-box">
                <div class="jobName"><span class="badge"><a href="/job/service/20/">#20</a></span></div>
              </div>
            </td>
            <td class="stage-cell stage-cell-0 SUCCESS"><div class="duration">7s</div></td>
            <td class="stage-cell stage-cell-1 FAILED"><div class="duration">20s</div></td>
            <td class="stage-cell stage-cell-2 NOT_EXECUTED"><div class="duration">0ms</div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

  test('reads stage names and latest run from Stage View table', async ({ page }) => {
    const { server, url } = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SAMPLE_STAGE_VIEW_HTML);
    });

    try {
      await page.goto(url);
      const stageNames = await readStageNames(page);
      expect(stageNames).toEqual(['SCM Checkout', 'Build: Maven', 'SAST: SonarQube']);

      const latestRun = await getLatestStageViewRun(page, stageNames);
      expect(latestRun).toBeDefined();
      expect(latestRun?.runId).toBe(21);
      expect(latestRun?.buildNumber).toBe('#21');
      expect(latestRun?.status).toBe('SUCCESS');
      expect(latestRun?.stages).toHaveLength(3);
      expect(latestRun?.stages[0]).toEqual({
        index: 0,
        name: 'SCM Checkout',
        status: 'SUCCESS',
        duration: '8s',
      });
      expect(latestRun?.stages[1]).toEqual({
        index: 1,
        name: 'Build: Maven',
        status: 'SUCCESS',
        duration: '1min 19s',
      });
    } finally {
      await close(server);
    }
  });

  test('waitForStageViewCompletion observes in-progress run transitioning to SUCCESS with progress logs', async ({ page }) => {
    let callCount = 0;
    const { server, url } = await listen((_req, res) => {
      callCount += 1;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (callCount <= 1) {
        // First call: run #22 is in-progress
        res.end(SAMPLE_STAGE_VIEW_HTML.replace(
          'data-runid="21"',
          'data-runid="22" class="job in-progress-run"><td class="stage-start"><div class="cell-box"><div class="jobName"><span class="badge"><a>#22</a></span></div></div></td><td class="stage-cell stage-cell-0 SUCCESS"><div class="duration">5s</div></td><td class="stage-cell stage-cell-1 in-progress-run"><div class="duration">10s</div></td><td class="stage-cell stage-cell-2 NOT_EXECUTED"></td></tr><tr class="job SUCCESS" data-runid="21"',
        ));
      } else {
        // Second call: run #22 finished with SUCCESS
        res.end(SAMPLE_STAGE_VIEW_HTML.replace(
          'data-runid="21"',
          'data-runid="22" class="job SUCCESS"><td class="stage-start"><div class="cell-box"><div class="jobName"><span class="badge"><a>#22</a></span></div></div></td><td class="stage-cell stage-cell-0 SUCCESS"><div class="duration">5s</div></td><td class="stage-cell stage-cell-1 SUCCESS"><div class="duration">40s</div></td><td class="stage-cell stage-cell-2 SUCCESS"><div class="duration">30s</div></td></tr><tr class="job SUCCESS" data-runid="21"',
        ));
      }
    });

    try {
      await page.goto(url);
      const progressLogs: string[] = [];
      const result = await waitForStageViewCompletion(page, 21, new WorkflowDeadline(5_000), {
        pollIntervalMs: 200,
        reloadIntervalMs: 500,
        onProgress: (msg) => progressLogs.push(msg),
      });

      expect(result.completed).toBe(true);
      expect(result.run?.runId).toBe(22);
      expect(result.run?.status).toBe('SUCCESS');
      expect(progressLogs.some((l) => l.includes('Detected build #22'))).toBe(true);
      expect(progressLogs.some((l) => l.includes('finished with result: SUCCESS'))).toBe(true);
    } finally {
      await close(server);
    }
  });

  test('waitForStageViewCompletion reports timeout if deadline expires before completion', async ({ page }) => {
    const { server, url } = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      // Keep returning run 21 (no new run > 21)
      res.end(SAMPLE_STAGE_VIEW_HTML);
    });

    try {
      await page.goto(url);
      const result = await waitForStageViewCompletion(page, 21, new WorkflowDeadline(400), {
        pollIntervalMs: 100,
        reloadIntervalMs: 1000,
      });

      expect(result.completed).toBe(false);
      expect(result.error).toContain('Timed out');
    } finally {
      await close(server);
    }
  });
});
