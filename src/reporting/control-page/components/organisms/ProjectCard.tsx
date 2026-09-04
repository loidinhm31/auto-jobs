import React from 'react';
import type { ProjectCardData } from '../../types/component-contracts.js';
import { Button } from '../atoms/Button.js';
import { Select } from '../atoms/Select.js';

export interface ProjectCardProps {
  project: ProjectCardData;
  isDirty?: boolean;
  onToggleEnabled: (projectId: string, enabled: boolean) => void;
  onChangeRunType: (projectId: string, runType: 'report' | 'auto-build') => void;
  onTriggerBuild: (project: ProjectCardData) => void;
}

export function ProjectCard({
  project,
  isDirty = false,
  onToggleEnabled,
  onChangeRunType,
  onTriggerBuild,
}: ProjectCardProps) {
  const isEnabled = project.enabled !== false;
  const runType = project.runType || 'report';
  const checkboxId = `checkbox-enabled-${project.id}`;
  const runTypeSelectId = `select-runtype-${project.id}`;

  return (
    <div className="project-card border border-slate-300 rounded-lg p-4 bg-slate-50 shadow-sm flex flex-col justify-between">
      <div>
        <div className="project-card-header flex justify-between items-baseline mb-2">
          <h3 className="m-0 text-base font-bold text-slate-900">{project.name || project.id}</h3>
        </div>

        <div className="project-card-fields flex flex-col gap-2 text-sm">
          <div className="field-row flex items-center justify-between">
            <span className="text-slate-600 font-medium">ID:</span>
            <span className="mono font-mono text-xs text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
              {project.id}
            </span>
          </div>

          <div className="field-row flex items-center justify-between">
            <label htmlFor={checkboxId} className="text-slate-600 font-medium cursor-pointer">
              Enabled:
            </label>
            <input
              type="checkbox"
              id={checkboxId}
              checked={isEnabled}
              onChange={(e) => onToggleEnabled(project.id, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
            />
          </div>

          <div className="field-row flex items-center justify-between gap-2">
            <label htmlFor={runTypeSelectId} className="text-slate-600 font-medium">
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

          <div className="field-row flex items-center justify-between gap-2">
            <span className="text-slate-600 font-medium shrink-0">Job URL:</span>
            {project.jobUrl ? (
              <a
                href={project.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mono font-mono text-xs text-sky-700 underline hover:text-sky-900 truncate max-w-[220px]"
                title={project.jobUrl}
              >
                {project.jobUrl}
              </a>
            ) : (
              <span className="mono font-mono text-xs text-slate-500">N/A</span>
            )}
          </div>
        </div>
      </div>

      {runType === 'auto-build' && (
        <div className="field-row mt-4 pt-3 border-t border-slate-200 flex justify-end">
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="btn-auto-build"
            disabled={!isEnabled || isDirty}
            onClick={() => onTriggerBuild(project)}
          >
            Trigger Auto-Build
          </Button>
        </div>
      )}
    </div>
  );
}
