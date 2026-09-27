import React from 'react';

import type { DashboardLayoutProps } from '../../types/component-contracts.js';
export type { DashboardLayoutProps };

export function DashboardLayout({
  header,
  banner,
  projectsSection,
  formBuilderSection,
  rawJsonSection,
  actionsSection,
  runSection,
  dialogs,
}: DashboardLayoutProps) {
  const skipLink = React.createElement(
    'a',
    { href: '#main-content', className: 'skip-link' },
    'Skip to main content',
  );

  const projectsHeader = React.createElement(
    'h2',
    {
      id: 'section-projects-title',
      className: 'text-lg font-bold text-slate-900 mt-0 mb-4 pb-2 border-b border-slate-200',
    },
    'Projects',
  );

  const projectsContainer = React.createElement(
    'section',
    {
      'aria-labelledby': 'section-projects-title',
      className: 'dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm',
    },
    projectsHeader,
    projectsSection,
  );

  const editorGrid = React.createElement(
    'div',
    { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' },
    formBuilderSection,
    rawJsonSection,
  );

  const editorContainer = React.createElement(
    'section',
    {
      'aria-labelledby': 'section-editor-title',
      className: 'dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm',
    },
    editorGrid,
  );

  const actionsHeader = React.createElement(
    'h2',
    {
      id: 'section-actions-title',
      className: 'text-lg font-bold text-slate-900 mt-0 mb-4 pb-2 border-b border-slate-200',
    },
    'Execute Actions',
  );

  const actionsContainer = React.createElement(
    'section',
    {
      'aria-labelledby': 'section-actions-title',
      className: 'dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm',
    },
    actionsHeader,
    actionsSection,
  );

  const runHeader = React.createElement(
    'h2',
    {
      id: 'section-run-title',
      className: 'text-lg font-bold text-slate-900 mt-0 mb-4 pb-2 border-b border-slate-200',
    },
    'Current / Recent Run',
  );

  const runContainer = React.createElement(
    'section',
    {
      'aria-labelledby': 'section-run-title',
      className: 'dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm',
    },
    runHeader,
    runSection,
  );

  const mainContent = React.createElement(
    'main',
    {
      id: 'main-content',
      className: 'main-container max-w-[1200px] mx-auto py-6 px-4',
    },
    banner,
    projectsContainer,
    editorContainer,
    actionsContainer,
    runContainer,
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
