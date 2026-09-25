import type { AggregateProjectSummary } from '../../types/report-management-types.js';
import { localReportHref } from '../../../report-links.js';
import { stateClass, stateLabel } from '../../../report-view-model.js';
import { Button } from '../atoms/Button.js';
import { ProjectRunsTable } from '../molecules/project-runs-table.js';
import { cn } from '../../utils/cn.js';

export interface ProjectReportHistoryCardProps {
  project: AggregateProjectSummary;
  onDeleteClick: (project: AggregateProjectSummary) => void;
  onDeleteRunClick?: (project: AggregateProjectSummary, runId: string) => void;
}

export function ProjectReportHistoryCard({
  project,
  onDeleteClick,
  onDeleteRunClick,
}: ProjectReportHistoryCardProps) {
  const currentReportHref = localReportHref(project.reportPath);
  const hasRuns = project.runs.length > 0;

  return (
    <section
      className="project-card bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm"
      aria-labelledby={`project-${project.projectId}`}
    >
      <div className="section-heading flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-200">
        <div>
          <p className="eyebrow text-xs uppercase font-bold tracking-wider text-slate-500 m-0 mb-1">
            Project
          </p>
          <h2
            id={`project-${project.projectId}`}
            className="text-xl font-bold text-slate-900 m-0 flex items-center gap-2"
          >
            <span>{project.name}</span>
            <code className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded">
              {project.projectId}
            </code>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn('state-badge', stateClass(project.state))}>
            {stateLabel(project.state)}
          </span>
          <Button
            variant="danger"
            size="sm"
            disabled={!hasRuns}
            onClick={() => onDeleteClick(project)}
            aria-label={`Delete Reports for ${project.name}`}
            id={`delete-project-${project.projectId}-btn`}
          >
            Delete Reports
          </Button>
        </div>
      </div>

      {currentReportHref ? (
        <div className="my-3">
          <a
            className="primary-link text-sm font-semibold text-sky-700 hover:text-sky-900 underline"
            href={currentReportHref}
          >
            Open current report
          </a>
        </div>
      ) : null}

      <ProjectRunsTable
        runs={project.runs}
        projectName={project.name}
        onDeleteRun={(runId) => onDeleteRunClick?.(project, runId)}
      />

      {project.warnings.length > 0 ? (
        <ul className="warning-list mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 list-disc list-inside">
          {project.warnings.map((warning: string, wIdx: number) => (
            <li key={wIdx}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
