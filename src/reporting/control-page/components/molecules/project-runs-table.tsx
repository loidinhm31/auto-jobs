import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Trash2 } from 'lucide-react';
import type { AggregateRunSummary } from '../../types/report-management-types.js';
import { localManifestHref, localReportHref } from '../../../report-links.js';
import { stateClass, stateLabel } from '../../../report-view-model.js';
import { Button } from '../atoms/Button.js';
import { cn } from '../../utils/cn.js';

export interface ProjectRunsTableProps {
  runs: readonly AggregateRunSummary[];
  projectName: string;
  onDeleteRun?: (runId: string) => void;
}

const RUNS_PER_PAGE = 20;

function renderArtifactLinks(run: AggregateRunSummary): React.ReactNode {
  const reportHref = localReportHref(run.reportPath);
  const manifestHref = localManifestHref(run.manifestPath);

  const links: React.ReactNode[] = [];
  if (reportHref) {
    links.push(
      React.createElement(
        'a',
        {
          key: 'report',
          href: reportHref,
          className:
            'inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 underline font-medium text-xs',
        },
        React.createElement(ExternalLink, { className: 'w-3 h-3', 'aria-hidden': true }),
        'Open report',
      ),
    );
  }
  if (manifestHref) {
    links.push(
      React.createElement(
        'a',
        {
          key: 'manifest',
          href: manifestHref,
          className:
            'inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 underline font-medium text-xs',
        },
        React.createElement(FileText, { className: 'w-3 h-3', 'aria-hidden': true }),
        'Manifest',
      ),
    );
  }

  if (links.length === 0) {
    return React.createElement(
      'span',
      { className: 'text-slate-400 text-xs italic' },
      'No local artifact link',
    );
  }

  const items: React.ReactNode[] = [];
  links.forEach((link, idx) => {
    if (idx > 0) {
      items.push(
        React.createElement(
          'span',
          { key: `sep-${idx}`, className: 'text-slate-300', 'aria-hidden': true },
          '·',
        ),
      );
    }
    items.push(link);
  });

  return React.createElement(
    'span',
    { className: 'flex items-center gap-2 flex-wrap' },
    ...items,
  );
}

export function ProjectRunsTable({ runs, projectName, onDeleteRun }: ProjectRunsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalRuns = runs.length;
  const totalPages = Math.max(1, Math.ceil(totalRuns / RUNS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  if (totalRuns === 0) {
    return React.createElement(
      'p',
      { className: 'empty-state text-sm text-slate-500 my-4 italic' },
      'No validated historical run manifest.',
    );
  }

  const startIndex = (currentPage - 1) * RUNS_PER_PAGE;
  const visibleRuns = runs.slice(startIndex, startIndex + RUNS_PER_PAGE);

  const captionElement = React.createElement(
    'caption',
    { className: 'sr-only' },
    `Historical runs for ${projectName}`,
  );

  const tableHeader = React.createElement(
    'thead',
    null,
    React.createElement(
      'tr',
      { className: 'border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold' },
      React.createElement('th', { scope: 'col', className: 'p-2.5 text-left font-semibold' }, 'Run'),
      React.createElement('th', { scope: 'col', className: 'p-2.5 text-left font-semibold' }, 'Job ID'),
      React.createElement('th', { scope: 'col', className: 'p-2.5 text-left font-semibold' }, 'Branch'),
      React.createElement('th', { scope: 'col', className: 'p-2.5 text-left font-semibold' }, 'State'),
      React.createElement('th', { scope: 'col', className: 'p-2.5 text-left font-semibold' }, 'Artifacts'),
      React.createElement('th', { scope: 'col', className: 'p-2.5 text-right font-semibold' }, 'Actions'),
    ),
  );

  const rows = visibleRuns.map((run: AggregateRunSummary) => {
    const runIdCell = React.createElement(
      'th',
      { scope: 'row', className: 'p-2.5 font-normal text-left' },
      React.createElement(
        'code',
        { className: 'text-xs font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200' },
        run.runId,
      ),
    );

    const jobIdCell = React.createElement(
      'td',
      { className: 'p-2.5 text-slate-600' },
      run.jobId ?? React.createElement('span', { className: 'text-slate-400' }, 'Unavailable'),
    );

    const branchCell = React.createElement(
      'td',
      { className: 'p-2.5 text-slate-600 font-mono text-xs' },
      run.branch ?? React.createElement('span', { className: 'text-slate-400 font-sans' }, 'Unavailable'),
    );

    const stateCell = React.createElement(
      'td',
      { className: 'p-2.5' },
      React.createElement(
        'span',
        { className: cn('state-badge', stateClass(run.state)) },
        stateLabel(run.state),
      ),
    );

    const artifactsChildren: React.ReactNode[] = [renderArtifactLinks(run)];
    if (run.warnings.length > 0) {
      artifactsChildren.push(
        React.createElement(
          'ul',
          {
            key: 'warnings',
            className: 'inline-warnings text-xs text-amber-700 list-disc list-inside mt-1',
          },
          run.warnings.map((warning: string, wIdx: number) =>
            React.createElement('li', { key: wIdx }, warning),
          ),
        ),
      );
    }

    const artifactsCell = React.createElement(
      'td',
      { className: 'p-2.5' },
      ...artifactsChildren,
    );

    const actionsCell = React.createElement(
      'td',
      { className: 'p-2.5 text-right' },
      React.createElement(
        Button,
        {
          variant: 'danger',
          size: 'sm',
          id: `delete-run-${run.runId}-btn`,
          onClick: () => onDeleteRun?.(run.runId),
          'aria-label': `Delete report run ${run.runId} for ${projectName}`,
          className: 'inline-flex items-center gap-1',
        },
        React.createElement(Trash2, { className: 'w-3 h-3', 'aria-hidden': true }),
        React.createElement('span', null, 'Delete'),
      ),
    );

    return React.createElement(
      'tr',
      {
        key: run.runId,
        className: 'border-b border-slate-100 hover:bg-slate-50 transition-colors',
      },
      runIdCell,
      jobIdCell,
      branchCell,
      stateCell,
      artifactsCell,
      actionsCell,
    );
  });

  const tableBody = React.createElement('tbody', null, ...rows);

  const tableElement = React.createElement(
    'table',
    { className: 'compact-table w-full text-left border-collapse text-sm' },
    captionElement,
    tableHeader,
    tableBody,
  );

  const scrollWrapper = React.createElement(
    'div',
    { className: 'table-scroll overflow-x-auto rounded border border-slate-200' },
    tableElement,
  );

  const containerChildren: React.ReactNode[] = [scrollWrapper];

  if (totalPages > 1) {
    const prevButton = React.createElement(
      Button,
      {
        variant: 'secondary',
        size: 'sm',
        disabled: currentPage <= 1,
        onClick: () => setCurrentPage((p) => Math.max(1, p - 1)),
        'aria-label': `Previous page for ${projectName}`,
        className: 'inline-flex items-center gap-1',
      },
      React.createElement(ChevronLeft, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      React.createElement('span', null, 'Previous'),
    );

    const pageIndicator = React.createElement(
      'span',
      { className: 'text-slate-600 font-medium text-xs' },
      `Page ${currentPage} of ${totalPages}`,
    );

    const nextButton = React.createElement(
      Button,
      {
        variant: 'secondary',
        size: 'sm',
        disabled: currentPage >= totalPages,
        onClick: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
        'aria-label': `Next page for ${projectName}`,
        className: 'inline-flex items-center gap-1',
      },
      React.createElement('span', null, 'Next'),
      React.createElement(ChevronRight, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
    );

    const paginationNav = React.createElement(
      'nav',
      {
        'aria-label': `Pagination for ${projectName}`,
        className:
          'pagination flex justify-between items-center pt-3 border-t border-slate-200 text-sm',
      },
      prevButton,
      pageIndicator,
      nextButton,
    );

    containerChildren.push(paginationNav);
  }

  return React.createElement(
    'div',
    { className: 'project-runs-container my-4' },
    ...containerChildren,
  );
}
