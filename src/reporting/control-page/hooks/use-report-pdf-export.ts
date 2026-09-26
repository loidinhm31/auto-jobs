import { useCallback, useEffect, useRef, useState } from 'react';
import { exportReportPdf } from '../utils/export-report-pdf.js';

export type ReportPdfExportStatus = 'idle' | 'preparing' | 'composing' | 'downloading' | 'error';

export interface ReportPdfExportState {
  readonly status: ReportPdfExportStatus;
  readonly errorMessage?: string | undefined;
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export function useReportPdfExport(projectId?: string, runId?: string) {
  const [state, setState] = useState<ReportPdfExportState>({ status: 'idle' });
  const isExportingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetError = useCallback(() => {
    if (mountedRef.current) {
      setState({ status: 'idle' });
    }
  }, []);

  const exportPdf = useCallback(
    async (container: HTMLElement | null) => {
      if (isExportingRef.current) return;
      if (!projectId || !runId) {
        if (mountedRef.current) {
          setState({
            status: 'error',
            errorMessage: 'Cannot export PDF: missing project ID or run ID',
          });
        }
        return;
      }
      if (!container) {
        if (mountedRef.current) {
          setState({
            status: 'error',
            errorMessage: 'Cannot export PDF: report content is not loaded',
          });
        }
        return;
      }

      isExportingRef.current = true;
      try {
        if (mountedRef.current) {
          setState({ status: 'preparing' });
        }

        await delay(50);
        if (!mountedRef.current) return;

        setState({ status: 'composing' });
        await delay(50);
        if (!mountedRef.current) return;

        setState({ status: 'downloading' });
        await exportReportPdf(container, { projectId, runId });

        if (mountedRef.current) {
          setState({ status: 'idle' });
        }
      } catch (err) {
        if (mountedRef.current) {
          const errorMessage = err instanceof Error ? err.message : 'PDF export failed';
          setState({ status: 'error', errorMessage });
        }
      } finally {
        isExportingRef.current = false;
      }
    },
    [projectId, runId],
  );

  return {
    state,
    exportPdf,
    resetError,
    isExporting: state.status !== 'idle' && state.status !== 'error',
  };
}
