import { useEffect, useState } from 'react';
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

function renderArtifactLinks(run: AggregateRunSummary) {
  const reportHref = localReportHref(run.reportPath);
  const manifestHref = localManifestHref(run.manifestPath);

  const links: React.ReactNode[] = [];
  if (reportHref) {
    links.push(
      <a
        key="report"
        href={reportHref}
        className="text-sky-700 hover:text-sky-900 underline"
      >
        Open report
      </a>,
    );
  }
  if (manifestHref) {
    links.push(
      <a
        key="manifest"
        href={manifestHref}
        className="text-sky-700 hover:text-sky-900 underline"
      >
        Manifest
      </a>,
    );
  }

  if (links.length === 0) {
    return <span className="text-slate-400">No local artifact link</span>;
  }

  return (
    <span className="flex items-center gap-2">
      {links.map((link, idx) => (
        <span key={idx} className="flex items-center gap-2">
          {idx > 0 && <span className="text-slate-300">·</span>}
          {link}
        </span>
      ))}
    </span>
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
    return (
      <p className="empty-state text-sm text-slate-500 my-4 italic">
        No validated historical run manifest.
      </p>
    );
  }

  const startIndex = (currentPage - 1) * RUNS_PER_PAGE;
  const visibleRuns = runs.slice(startIndex, startIndex + RUNS_PER_PAGE);

  return (
    <div className="project-runs-container my-4">
      <div className="table-scroll overflow-x-auto">
        <table className="compact-table w-full text-left border-collapse text-sm">
          <caption className="sr-only">Historical runs for {projectName}</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
              <th scope="col" className="p-2.5">Run</th>
              <th scope="col" className="p-2.5">Job ID</th>
              <th scope="col" className="p-2.5">Branch</th>
              <th scope="col" className="p-2.5">State</th>
              <th scope="col" className="p-2.5">Artifacts</th>
              <th scope="col" className="p-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRuns.map((run: AggregateRunSummary) => (
              <tr key={run.runId} className="border-b border-slate-100 hover:bg-slate-50">
                <th scope="row" className="p-2.5 font-normal">
                  <code className="text-xs font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    {run.runId}
                  </code>
                </th>
                <td className="p-2.5 text-slate-600">
                  {run.jobId ?? <span className="text-slate-400">Unavailable</span>}
                </td>
                <td className="p-2.5 text-slate-600">
                  {run.branch ?? <span className="text-slate-400">Unavailable</span>}
                </td>
                <td className="p-2.5">
                  <span className={cn('state-badge', stateClass(run.state))}>
                    {stateLabel(run.state)}
                  </span>
                </td>
                <td className="p-2.5">
                  {renderArtifactLinks(run)}
                  {run.warnings.length > 0 ? (
                    <ul className="inline-warnings text-xs text-amber-700 list-disc list-inside mt-1">
                      {run.warnings.map((warning: string, wIdx: number) => (
                        <li key={wIdx}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="p-2.5 text-right">
                  <Button
                    variant="danger"
                    size="sm"
                    id={`delete-run-${run.runId}-btn`}
                    onClick={() => onDeleteRun?.(run.runId)}
                    aria-label={`Delete report run ${run.runId} for ${projectName}`}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <nav
          aria-label={`Pagination for ${projectName}`}
          className="pagination flex justify-between items-center pt-3 border-t border-slate-200 text-sm"
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label={`Previous page for ${projectName}`}
          >
            Previous
          </Button>
          <span className="text-slate-600 font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            aria-label={`Next page for ${projectName}`}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
