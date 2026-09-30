import React from 'react';
import type { ReportProjectResult } from '../../types/index.js';
import { cn } from '../../utils/cn.js';

export interface ReportProjectOutcomeRowProps {
  readonly project: ReportProjectResult;
  readonly className?: string;
}

export function ReportProjectOutcomeRow({ project, className }: ReportProjectOutcomeRowProps) {
  const statusBadgeClass =
    project.status === 'success'
      ? 'bg-emerald-100 text-emerald-800'
      : project.status === 'partial'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800';

  return React.createElement(
    'div',
    {
      className: cn(
        'flex flex-wrap items-center gap-2 text-xs py-1 border-b border-slate-100 last:border-b-0',
        className,
      ),
    },
    React.createElement('span', { className: 'font-semibold text-slate-900' }, project.projectName),
    project.columnName
      ? React.createElement(
        'span',
        { className: 'font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded' },
        project.columnName,
      )
      : null,
    React.createElement(
      'span',
      {
        className: cn('px-2 py-0.5 rounded text-xs font-semibold', statusBadgeClass),
      },
      project.status,
    ),
    project.reportUrl
      ? React.createElement(
        'a',
        {
          href: project.reportUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'text-indigo-600 hover:text-indigo-800 underline ml-auto',
        },
        'View Report',
      )
      : null,
    project.error
      ? React.createElement('span', { className: 'text-red-600 w-full' }, project.error)
      : null,
  );
}
