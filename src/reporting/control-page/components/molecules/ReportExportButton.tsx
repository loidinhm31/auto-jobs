import React, { useCallback } from 'react';
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

  const spinnerSvg = React.createElement(
    'svg',
    {
      className: 'animate-spin h-3.5 w-3.5 text-current',
      xmlns: 'http://www.w3.org/2000/svg',
      fill: 'none',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
    },
    React.createElement('circle', {
      className: 'opacity-25',
      cx: 12,
      cy: 12,
      r: 10,
      stroke: 'currentColor',
      strokeWidth: 4,
    }),
    React.createElement('path', {
      className: 'opacity-75',
      fill: 'currentColor',
      d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z',
    }),
  );

  const downloadSvg = React.createElement(
    'svg',
    {
      className: 'h-3.5 w-3.5 text-current',
      xmlns: 'http://www.w3.org/2000/svg',
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      strokeWidth: 2,
      'aria-hidden': 'true',
    },
    React.createElement('path', {
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      d: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
    }),
  );

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
    isExporting ? spinnerSvg : downloadSvg,
    React.createElement('span', null, buttonText),
  );

  return React.createElement(
    'div',
    { id: 'report-export-controls', className: 'flex items-center gap-3' },
    errorAlert,
    button,
  );
}
