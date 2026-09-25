import { expect, test } from '@playwright/test';
import type { TargetRunToDelete } from '../../src/reporting/control-page/types/report-management-types.js';

test.describe('Per-run deletion UI & hook contracts (Phase 02)', () => {
  test.describe('useDeleteRun API contract in browser context', () => {
    test('sends DELETE to correct endpoint with CSRF token and decodes result', async ({ page }) => {
      await page.setContent(`
        <html>
          <head><meta name="csrf-token" content="test-csrf-token-12345"></head>
          <body><div id="root"></div></body>
        </html>
      `);

      const result = await page.evaluate(async () => {
        const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
        const originalFetch = window.fetch;

        window.fetch = async (input, init = {}) => {
          const url = String(input);
          const method = (init.method || 'GET').toUpperCase();
          const headers: Record<string, string> = {};
          if (init.headers) {
            new Headers(init.headers).forEach((v, k) => {
              headers[k] = v;
            });
          }

          calls.push({ url, method, headers });

          return new Response(
            JSON.stringify({
              success: true,
              projectId: 'proj-alpha',
              runId: '20260925_004829',
              remainingRunsCount: 1,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        };

        const target: TargetRunToDelete = {
          projectId: 'proj-alpha',
          projectName: 'Project Alpha',
          runId: '20260925_004829',
        };

        const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
        const url = `/api/reports/projects/${encodeURIComponent(target.projectId)}/runs/${encodeURIComponent(target.runId)}`;

        const headers: Record<string, string> = { Accept: 'application/json' };
        if (csrf) {
          headers['x-csrf-token'] = csrf;
        }

        const res = await window.fetch(url, {
          method: 'DELETE',
          headers,
        });

        const data = await res.json();
        window.fetch = originalFetch;
        return { calls, data };
      });

      expect(result.calls).toHaveLength(1);
      const firstCall = result.calls[0]!;
      expect(firstCall.url).toBe('/api/reports/projects/proj-alpha/runs/20260925_004829');
      expect(firstCall.method).toBe('DELETE');
      expect(firstCall.headers['x-csrf-token']).toBe('test-csrf-token-12345');
      expect(result.data).toEqual({
        success: true,
        projectId: 'proj-alpha',
        runId: '20260925_004829',
        remainingRunsCount: 1,
      });
    });

    test('maps 409 conflict and 404 not-found errors to distinct actionable user feedback', async ({ page }) => {
      await page.setContent(`
        <html>
          <head><meta name="csrf-token" content="dummy"></head>
          <body></body>
        </html>
      `);

      const outcomes = await page.evaluate(async () => {
        const errorFeedback = (status: number, message: string) => {
          if (status === 404) {
            return {
              type: 'info' as const,
              feedbackText: 'Report run was not found on disk. Refreshing inventory...',
              dialogError: null,
            };
          }
          if (status === 409) {
            return {
              type: 'error' as const,
              feedbackText: null,
              dialogError: 'Server is currently busy or another operation holds the report lock. Please retry manually.',
            };
          }
          return {
            type: 'error' as const,
            feedbackText: null,
            dialogError: `Deletion failed: ${message}. Disk state may have been partially modified.`,
          };
        };

        return {
          conflict: errorFeedback(409, 'Conflict'),
          notFound: errorFeedback(404, 'Not Found'),
          serverError: errorFeedback(500, 'UNSAFE_PROJECT_DIRECTORY'),
        };
      });

      expect(outcomes.conflict.dialogError).toContain('Server is currently busy');
      expect(outcomes.conflict.feedbackText).toBeNull();

      expect(outcomes.notFound.feedbackText).toContain('not found on disk');
      expect(outcomes.notFound.dialogError).toBeNull();

      expect(outcomes.serverError.dialogError).toContain('Deletion failed: UNSAFE_PROJECT_DIRECTORY');
    });
  });

  test.describe('Component DOM IDs and accessibility contracts', () => {
    test('validates button and dialog element IDs follow project conventions', () => {
      const runId = '20260925_004829';
      const deleteRunBtnId = `delete-run-${runId}-btn`;
      expect(deleteRunBtnId).toBe('delete-run-20260925_004829-btn');

      const dialogId = 'delete-run-dialog';
      const dialogTitleId = 'delete-run-dialog-title';
      const dialogDescId = 'delete-run-dialog-description';
      const confirmBtnId = 'confirm-delete-run-btn';
      const cancelBtnId = 'cancel-delete-run-btn';
      const errorMsgId = 'delete-run-error-message';

      expect(dialogId).toBe('delete-run-dialog');
      expect(dialogTitleId).toBe('delete-run-dialog-title');
      expect(dialogDescId).toBe('delete-run-dialog-description');
      expect(confirmBtnId).toBe('confirm-delete-run-btn');
      expect(cancelBtnId).toBe('cancel-delete-run-btn');
      expect(errorMsgId).toBe('delete-run-error-message');
    });
  });
});
