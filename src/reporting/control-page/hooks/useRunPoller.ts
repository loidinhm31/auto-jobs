import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RunLogEntry,
  RunRecord,
  RunResult,
  RunStatus,
  RunStatusResponse,
  RunTriggerRequest,
  RunTriggerResponse,
} from '../types/index.js';
import { useControlApi, type UseControlApiResult } from './useControlApi.js';

export interface UseRunPollerResult {
  runId: string | null;
  runStatus: RunStatus;
  logs: RunLogEntry[];
  result: RunResult | null;
  isTriggering: boolean;
  error: string | null;
  triggerRun: (
    configName: string,
    configEtag: string,
    runType: 'report' | 'auto-build',
    projectId?: string,
    waitForCompletion?: boolean,
    waitTimeoutMs?: number,
  ) => Promise<string | null>;
  resetRun: () => void;
  stopPolling: () => void;
}

const BASE_POLL_INTERVAL_MS = 1000;
const MAX_POLL_INTERVAL_MS = 10000;
const MAX_CONSECUTIVE_ERRORS = 5;

const TERMINAL_STATUSES = new Set<RunStatus>(['succeeded', 'failed', 'submission-unknown']);

/**
 * Hook managing the execution lifecycle of report generation and auto-build runs,
 * polling GET /api/run?id=<runId> with exponential backoff on transient errors,
 * and cleaning up all timers and abort controllers upon unmount.
 */
export function useRunPoller(apiOverride?: UseControlApiResult): UseRunPollerResult {
  const defaultApi = useControlApi();
  const api = apiOverride ?? defaultApi;

  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const consecutiveErrorsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (abortControllerRef.current !== null) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    consecutiveErrorsRef.current = 0;
  }, []);

  const resetRun = useCallback(() => {
    stopPolling();
    setRunId(null);
    setRunStatus('idle');
    setLogs([]);
    setResult(null);
    setError(null);
    setIsTriggering(false);
  }, [stopPolling]);

  const pollRun = useCallback(
    async (targetRunId: string): Promise<void> => {
      if (!isMountedRef.current) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const resp = await api.apiFetch(`/api/run?id=${encodeURIComponent(targetRunId)}`, {
          signal: controller.signal,
        });

        if (!isMountedRef.current) return;

        if (!resp.ok) {
          // Immediate termination on fatal non-transient 4xx errors (excluding 408 Request Timeout and 429 Rate Limit)
          if (
            resp.status >= 400 &&
            resp.status < 500 &&
            resp.status !== 408 &&
            resp.status !== 429
          ) {
            let errText = `HTTP ${resp.status}`;
            try {
              const errJson = (await resp.json()) as { error?: { message?: string } };
              if (errJson?.error?.message) {
                errText = errJson.error.message;
              }
            } catch {
              // Ignore parse error
            }
            setError(errText);
            setRunStatus('failed');
            stopPolling();
            return;
          }
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = (await resp.json()) as RunStatusResponse;
        const run: RunRecord = data.run;

        consecutiveErrorsRef.current = 0;
        setRunStatus(run.status);
        setLogs(run.logs || []);
        if (run.result !== undefined) {
          setResult(run.result);
        }

        if (TERMINAL_STATUSES.has(run.status)) {
          stopPolling();
          return;
        }

        // Schedule next poll
        pollTimerRef.current = setTimeout(() => {
          void pollRun(targetRunId);
        }, BASE_POLL_INTERVAL_MS);
      } catch (err) {
        if (!isMountedRef.current) return;
        if (controller.signal.aborted) return;

        consecutiveErrorsRef.current += 1;
        const currentFailures = consecutiveErrorsRef.current;

        if (currentFailures >= MAX_CONSECUTIVE_ERRORS) {
          const errMsg = err instanceof Error ? err.message : String(err);
          setError(`Lost polling connection: ${errMsg}`);
          setRunStatus('failed');
          stopPolling();
          return;
        }

        // Exponential backoff
        const backoffDelay = Math.min(
          BASE_POLL_INTERVAL_MS * Math.pow(2, currentFailures),
          MAX_POLL_INTERVAL_MS,
        );

        pollTimerRef.current = setTimeout(() => {
          void pollRun(targetRunId);
        }, backoffDelay);
      }
    },
    [api, stopPolling],
  );

  const triggerRun = useCallback(
    async (
      configName: string,
      configEtag: string,
      runType: 'report' | 'auto-build',
      projectId?: string,
      waitForCompletion?: boolean,
      waitTimeoutMs?: number,
    ): Promise<string | null> => {
      stopPolling();
      setIsTriggering(true);
      setError(null);
      setLogs([]);
      setResult(null);

      const payload: RunTriggerRequest = {
        configName,
        configEtag,
        runType,
        ...(projectId ? { projectId } : {}),
        ...(waitForCompletion !== undefined ? { waitForCompletion } : {}),
        ...(waitTimeoutMs !== undefined ? { waitTimeoutMs } : {}),
      };

      try {
        const resp = await api.apiFetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!isMountedRef.current) return null;

        if (!resp.ok) {
          let errText = `HTTP ${resp.status}`;
          try {
            const errJson = (await resp.json()) as { error?: { message?: string } };
            if (errJson?.error?.message) {
              errText = errJson.error.message;
            }
          } catch {
            // Ignore parse error
          }
          throw new Error(errText);
        }

        const data = (await resp.json()) as RunTriggerResponse;
        const newRunId = data.id;
        const initialStatus: RunStatus = data.status || 'queued';

        setRunId(newRunId);
        setRunStatus(initialStatus);

        // Immediate first poll then interval
        void pollRun(newRunId);
        return newRunId;
      } catch (err) {
        if (!isMountedRef.current) return null;
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(`Failed to start run: ${errMsg}`);
        return null;
      } finally {
        if (isMountedRef.current) {
          setIsTriggering(false);
        }
      }
    },
    [api, pollRun, stopPolling],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    runId,
    runStatus,
    logs,
    result,
    isTriggering,
    error,
    triggerRun,
    resetRun,
    stopPolling,
  };
}
