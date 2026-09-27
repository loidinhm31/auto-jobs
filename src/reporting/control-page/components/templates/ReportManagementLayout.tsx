import React from 'react';

import type { ReportManagementLayoutProps } from '../../types/component-contracts.js';
export type { ReportManagementLayoutProps };
export function ReportManagementLayout({
  header,
  banner,
  searchFilter,
  content,
  historyList,
  dialogs,
  children,
}: ReportManagementLayoutProps) {
  const skipLink = React.createElement(
    'a',
    { href: '#main-content', className: 'skip-link' },
    'Skip to main content',
  );

  const mainContent = React.createElement(
    'main',
    {
      id: 'main-content',
      className: 'main-container max-w-[1200px] mx-auto py-6 px-4',
    },
    banner,
    searchFilter,
    content,
    historyList,
    children,
  );

  return React.createElement(
    'div',
    { className: 'min-h-screen bg-slate-50 text-slate-900' },
    skipLink,
    header,
    mainContent,
    dialogs,
  );
}
