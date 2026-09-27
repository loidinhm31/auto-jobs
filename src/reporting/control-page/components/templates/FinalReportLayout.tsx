import React from 'react';

import type { FinalReportLayoutProps } from '../../types/component-contracts.js';
export type { FinalReportLayoutProps };
export function FinalReportLayout({
  header,
  toolbar,
  exportAction,
  statusView,
  reportContent,
  children,
}: FinalReportLayoutProps) {
  const skipLink = React.createElement(
    'a',
    { href: '#project-report-surface', className: 'skip-link' },
    'Skip to report content',
  );

  const defaultHeader = (toolbar || exportAction)
    ? React.createElement(
        'header',
        { className: 'control-report-bar bg-white border-b border-slate-300 py-3 px-6 shadow-sm' },
        React.createElement(
          'div',
          { className: 'max-w-[1200px] mx-auto flex flex-wrap justify-between items-center gap-4' },
          toolbar,
          exportAction,
        ),
      )
    : null;

  return React.createElement(
    'div',
    { className: 'final-project-report-viewer min-h-screen bg-[#f4f7fb] text-[#172033]' },
    skipLink,
    header ?? defaultHeader,
    statusView,
    reportContent,
    children,
  );
}
