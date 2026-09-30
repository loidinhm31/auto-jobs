import React from 'react';
import type { DashboardLayoutProps } from '../../types/component-contracts.js';

export type { DashboardLayoutProps };

export function DashboardLayout({
  header,
  banner,
  matrixSection,
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

  const mainSections: React.ReactNode[] = [];
  if (banner) mainSections.push(banner);

  if (matrixSection) {
    mainSections.push(
      React.createElement(
        'section',
        {
          key: 'matrix',
          id: 'section-matrix',
          'aria-labelledby': 'heading-matrix',
          className: 'max-w-[1200px] mx-auto px-4 sm:px-6',
        },
        React.createElement(
          'h2',
          { id: 'heading-matrix', className: 'text-xl font-bold text-slate-900 mb-4' },
          'Projects Job Matrix',
        ),
        matrixSection,
      ),
    );
  }

  if (projectsSection && !matrixSection) {
    mainSections.push(
      React.createElement(
        'section',
        {
          key: 'projects',
          id: 'section-projects',
          'aria-labelledby': 'heading-projects',
          className: 'max-w-[1200px] mx-auto px-4 sm:px-6',
        },
        React.createElement(
          'h2',
          { id: 'heading-projects', className: 'text-xl font-bold text-slate-900 mb-4' },
          'Projects',
        ),
        projectsSection,
      ),
    );
  }

  if (formBuilderSection || rawJsonSection) {
    mainSections.push(
      React.createElement(
        'section',
        {
          key: 'editor',
          id: 'section-editor',
          'aria-labelledby': 'heading-editor',
          className: 'max-w-[1200px] mx-auto px-4 sm:px-6',
        },
        React.createElement(
          'div',
          { className: formBuilderSection ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'w-full' },
          formBuilderSection,
          rawJsonSection,
        ),
      ),
    );
  }

  mainSections.push(
    React.createElement(
      'section',
      {
        key: 'actions',
        id: 'section-actions',
        'aria-labelledby': 'heading-actions',
        className: 'max-w-[1200px] mx-auto px-4 sm:px-6',
      },
      React.createElement(
        'h2',
        { id: 'heading-actions', className: 'text-xl font-bold text-slate-900 mb-4' },
        'Execute Actions',
      ),
      actionsSection,
    ),
  );

  mainSections.push(
    React.createElement(
      'section',
      {
        key: 'run',
        id: 'section-run',
        'aria-labelledby': 'heading-run',
        className: 'max-w-[1200px] mx-auto px-4 sm:px-6',
      },
      React.createElement(
        'h2',
        { id: 'heading-run', className: 'text-xl font-bold text-slate-900 mb-4' },
        'Current / Recent Run',
      ),
      runSection,
    ),
  );

  const mainContent = React.createElement(
    'main',
    { id: 'main-content', className: 'pb-16 space-y-6' },
    ...mainSections,
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
