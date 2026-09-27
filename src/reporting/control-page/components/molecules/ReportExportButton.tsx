import React, { useCallback } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useReportPdfExport } from '../../hooks/use-report-pdf-export.js';

export interface ReportExportButtonProps {
  readonly projectId?: string | undefined;
  readonly runId?: string | undefined;
  readonly isReady: boolean;
  readonly getReportElement: () => HTMLElement | null;
}

export function ReportExportButton({
  projectId,
  runId,
  isReady,
  getReportElement,
}: ReportExportButtonProps) {
  const { state, exportPdf, resetError, isExporting } = useReportPdfExport(projectId, runId);

  const handleClick = useCallback(() => {
    const el = getReportElement();
    void exportPdf(el);
  }, [exportPdf, getReportElement]);

  let buttonText = 'Export PDF';
  if (state.status === 'preparing') {
    buttonText = 'Preparing...';
  } else if (state.status === 'composing') {
    buttonText = 'Generating PDF...';
  } else if (state.status === 'downloading') {
    buttonText = 'Downloading...';
  } else if (state.status === 'error') {
    buttonText = 'Retry Export PDF';
  }

  const disabled = !isReady || isExporting;

  const iconElement = isExporting
    ? React.createElement(Loader2, {
        className: 'animate-spin h-3.5 w-3.5 text-current',
        'aria-hidden': 'true',
      })
    : React.createElement(Download, {
        className: 'h-3.5 w-3.5 text-current',
        'aria-hidden': 'true',
      });

  const errorAlert =
    state.status === 'error' && state.errorMessage
      ? React.createElement(
          'div',
          {
            role: 'alert',
            'aria-live': 'assertive',
            className:
              'text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1 flex items-center gap-2',
          },
          React.createElement('span', null, state.errorMessage),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: resetError,
              className: 'text-red-800 font-semibold underline hover:text-red-900 focus:outline-none',
            },
            'Dismiss',
          ),
        )
      : null;

  const button = React.createElement(
    'button',
    {
      id: 'export-pdf-button',
      type: 'button',
      disabled,
      onClick: handleClick,
      'aria-busy': isExporting,
      className: `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500 ${
        disabled
          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
          : 'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800 cursor-pointer'
      }`,
    },
    iconElement,
    React.createElement('span', null, buttonText),
  );

  return React.createElement(
    'div',
    { id: 'report-export-controls', className: 'flex items-center gap-3' },
    errorAlert,
    button,
  );
}
