import React from 'react';
import type { ProjectReportState } from '../../hooks/use-project-report.js';

interface ProjectReportStatusViewProps {
  readonly state: ProjectReportState;
  readonly onReload: () => void;
}

export function ProjectReportStatusView({ state, onReload }: ProjectReportStatusViewProps) {
  if (state.status === 'ready') return null;

  let content: React.ReactNode = null;

  if (state.status === 'loading') {
    content = React.createElement(
      'div',
      {
        role: 'status',
        'aria-live': 'polite',
        className: 'flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-700',
      },
      React.createElement('div', {
        className: 'w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin',
        'aria-hidden': 'true',
      }),
      React.createElement('span', { className: 'text-sm font-medium' }, 'Loading report evidence...'),
    );
  } else if (state.status === 'missing') {
    content = React.createElement(
      'div',
      {
        role: 'alert',
        className: 'p-6 bg-white border border-amber-300 rounded-lg shadow-sm space-y-3',
      },
      React.createElement('h2', { className: 'text-lg font-bold text-amber-900 m-0' }, 'Report Not Found'),
      React.createElement('p', { className: 'text-sm text-amber-800 m-0' }, state.message),
      React.createElement(
        'div',
        null,
        React.createElement(
          'a',
          {
            href: '/reports/index.html',
            className:
              'inline-block px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500',
          },
          'Return to Report Index',
        ),
      ),
    );
  } else if (state.status === 'invalid') {
    content = React.createElement(
      'div',
      {
        role: 'alert',
        className: 'p-6 bg-white border border-red-300 rounded-lg shadow-sm space-y-3',
      },
      React.createElement('h2', { className: 'text-lg font-bold text-red-900 m-0' }, 'Invalid Report Evidence'),
      React.createElement('p', { className: 'text-sm text-red-800 m-0' }, state.message),
      React.createElement(
        'div',
        null,
        React.createElement(
          'a',
          {
            href: '/reports/index.html',
            className:
              'inline-block px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-500',
          },
          'Return to Report Index',
        ),
      ),
    );
  } else if (state.status === 'load-error') {
    content = React.createElement(
      'div',
      {
        role: 'alert',
        className: 'p-6 bg-white border border-red-300 rounded-lg shadow-sm space-y-3',
      },
      React.createElement('h2', { className: 'text-lg font-bold text-red-900 m-0' }, 'Error Loading Report'),
      React.createElement('p', { className: 'text-sm text-red-800 m-0' }, state.message),
      React.createElement(
        'div',
        { className: 'flex items-center gap-3' },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: onReload,
            className:
              'px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500',
          },
          'Retry',
        ),
        React.createElement(
          'a',
          {
            href: '/reports/index.html',
            className:
              'px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium rounded focus:outline-none focus:ring-2 focus:ring-slate-400',
          },
          'Return to Report Index',
        ),
      ),
    );
  }

  return React.createElement('div', { className: 'max-w-[1200px] mx-auto px-6 py-6' }, content);
}
