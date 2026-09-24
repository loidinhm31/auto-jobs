import React from 'react';
import type { AutoBuildProjectResult } from '../../types/index.js';
import { cn } from '../../utils/cn.js';

export interface BuildProjectOutcomeRowProps {
  readonly project: AutoBuildProjectResult;
  readonly className?: string;
}

/**
 * Renders an individual auto-build project outcome in the run results box,
 * displaying identifier, status badge, optional build number/link, stage breakdowns, and errors.
 */
export function BuildProjectOutcomeRow({ project, className }: BuildProjectOutcomeRowProps) {
  const isSuccess =
    project.exitCode === 0 &&
    (project.buildResult === 'SUCCESS' ||
      project.state === 'succeeded' ||
      project.state === 'submitted');

  const isFailure =
    project.exitCode !== 0 ||
    project.buildResult === 'FAILURE' ||
    project.state === 'failed' ||
    project.state === 'submission-unknown' ||
    project.state === 'timeout' ||
    project.state === 'rejected' ||
    project.state === 'failed-before-submit';

  const badgeLabel = project.buildResult || project.state;
  const targetUrl = project.buildPageUrl || project.jobUrl;
  const hasValidLink =
    Boolean(targetUrl) &&
    (targetUrl.startsWith('http://') ||
      targetUrl.startsWith('https://') ||
      targetUrl.startsWith('/'));

  const headerChildren: React.ReactNode[] = [
    React.createElement(
      'span',
      { key: 'proj-name', className: 'font-semibold text-slate-900' },
      project.projectName || project.projectId,
    ),
  ];

  if (project.projectName && project.projectName !== project.projectId) {
    headerChildren.push(
      React.createElement(
        'span',
        { key: 'proj-id', className: 'font-mono text-xs text-slate-500' },
        `(${project.projectId})`,
      ),
    );
  }

  headerChildren.push(
    React.createElement(
      'span',
      {
        key: 'proj-badge',
        className: cn(
          'px-2 py-0.5 rounded text-xs font-semibold',
          isSuccess
            ? 'bg-emerald-100 text-emerald-800'
            : isFailure
            ? 'bg-red-100 text-red-800'
            : 'bg-slate-100 text-slate-800',
        ),
      },
      badgeLabel,
    ),
  );

  if (project.buildNumber) {
    headerChildren.push(
      React.createElement(
        'span',
        { key: 'proj-b-num', className: 'text-xs font-medium text-slate-700' },
        `Build #${project.buildNumber}`,
      ),
    );
  }

  if (hasValidLink) {
    headerChildren.push(
      React.createElement(
        'a',
        {
          key: 'proj-link',
          href: targetUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'text-emerald-700 font-semibold underline hover:text-emerald-800 text-xs',
        },
        'Open Jenkins Build',
      ),
    );
  }

  const rowChildren: React.ReactNode[] = [
    React.createElement(
      'div',
      { key: 'header-row', className: 'flex flex-wrap items-center gap-2' },
      ...headerChildren,
    ),
  ];

  if (Array.isArray(project.stages) && project.stages.length > 0) {
    rowChildren.push(
      React.createElement(
        'div',
        { key: 'proj-stages', className: 'mt-1 flex flex-wrap gap-1 text-xs text-slate-600' },
        project.stages.map((st) =>
          React.createElement(
            'span',
            {
              key: `st-${st.index}`,
              className: cn(
                'px-1.5 py-0.5 rounded border',
                st.status === 'SUCCESS'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : st.status === 'FAILED'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-100 text-slate-600',
              ),
            },
            `${st.name}: ${st.status}${st.duration ? ` (${st.duration})` : ''}`,
          ),
        ),
      ),
    );
  }

  if (project.error) {
    rowChildren.push(
      React.createElement(
        'p',
        {
          key: 'proj-error',
          className: 'run-error-msg text-red-600 font-medium text-xs m-0 mt-1',
        },
        `Error: ${project.error}`,
      ),
    );
  }

  return React.createElement(
    'div',
    {
      className: cn(
        'build-project-outcome py-2 border-b border-slate-200 last:border-b-0',
        className,
      ),
    },
    ...rowChildren,
  );
}
