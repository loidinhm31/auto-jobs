import React from 'react';
import type { ProjectCardData } from '../../types/component-contracts.js';
import { Select } from '../atoms/Select.js';

export interface ProjectCardProps {
  project: ProjectCardData;
  onToggleEnabled: (projectId: string, enabled: boolean) => void;
  onChangeRunType: (projectId: string, runType: 'report' | 'auto-build') => void;
}

export function ProjectCard({
  project,
  onToggleEnabled,
  onChangeRunType,
}: ProjectCardProps) {
  const isEnabled = project.enabled !== false;
  const runType = project.runType || 'report';
  const checkboxId = `checkbox-enabled-${project.id}`;
  const runTypeSelectId = `select-runtype-${project.id}`;
  const trimmedJobUrl = typeof project.jobUrl === 'string' ? project.jobUrl.trim() : '';
  const isSafeJobUrl = /^https?:\/\//i.test(trimmedJobUrl);
  return (
    <div className="project-card border border-slate-300 rounded-lg p-3 bg-slate-50 shadow-xs flex flex-col gap-2 shrink-0">
      <div className="project-card-header flex items-baseline justify-between gap-2 min-w-0">
        <h4
          className="m-0 text-sm font-bold text-slate-900 truncate focus:outline-hidden focus:ring-1 focus:ring-sky-500 rounded-xs"
          tabIndex={0}
          title={project.name || project.id}
        >
          {project.name || project.id}
        </h4>
        <span
          className="mono font-mono text-xs text-slate-700 bg-slate-200/70 px-1.5 py-0.5 rounded-xs shrink-0 max-w-[120px] truncate"
          tabIndex={0}
          title={project.id}
          aria-label={`Project ID: ${project.id}`}
        >
          {project.id}
        </span>
      </div>

      <div className="project-card-fields flex flex-col gap-2 text-xs">
        <div className="field-row flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id={checkboxId}
              checked={isEnabled}
              onChange={(e) => onToggleEnabled(project.id, e.target.checked)}
              className="h-4 w-4 rounded-xs border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
            />
            <label htmlFor={checkboxId} className="text-slate-700 font-medium cursor-pointer select-none">
              Enabled
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor={runTypeSelectId} className="text-slate-600 font-medium shrink-0">
              Run Type:
            </label>
            <Select
              id={runTypeSelectId}
              ariaLabel={`Run type for ${project.name || project.id}`}
              value={runType}
              onChange={(e) =>
                onChangeRunType(project.id, e.target.value as 'report' | 'auto-build')
              }
              options={[
                { value: 'report', label: 'report' },
                { value: 'auto-build', label: 'auto-build' },
              ]}
              className="py-1 px-2 text-xs"
            />
          </div>
        </div>

        <div className="field-row flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
          <span className="text-slate-500 font-medium shrink-0">Job URL:</span>
          {isSafeJobUrl ? (
            <a
              href={trimmedJobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono font-mono text-xs text-sky-700 underline hover:text-sky-900 truncate focus:outline-hidden focus:ring-1 focus:ring-sky-500 rounded-xs"
              title={trimmedJobUrl}
              aria-label={`Job URL for ${project.name || project.id}: ${trimmedJobUrl}`}
            >
              {trimmedJobUrl}
            </a>
          ) : trimmedJobUrl ? (
            <span
              className="mono font-mono text-xs text-slate-600 truncate"
              title={trimmedJobUrl}
            >
              {trimmedJobUrl}
            </span>
          ) : (
            <span className="mono font-mono text-xs text-slate-400">N/A</span>
          )}
        </div>
      </div>
    </div>
  );
}
