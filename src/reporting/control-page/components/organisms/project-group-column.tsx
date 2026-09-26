import React from 'react';
import type { ProjectCardData } from '../../types/component-contracts.js';
import { ProjectCard } from './ProjectCard.js';

export interface ProjectGroupColumnProps {
  groupId: string | null;
  groupName: string;
  projects: readonly ProjectCardData[];
  onToggleEnabled: (projectId: string, enabled: boolean) => void;
  onChangeRunType: (projectId: string, runType: 'report' | 'auto-build') => void;
  onManageProjects?: (groupId: string) => void;
  onRenameGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  disabled?: boolean;
}

export function ProjectGroupColumn({
  groupId,
  groupName,
  projects,
  onToggleEnabled,
  onChangeRunType,
  onManageProjects,
  onRenameGroup,
  onDeleteGroup,
  disabled = false,
}: ProjectGroupColumnProps) {
  const isUngrouped = groupId === null;
  const columnId = isUngrouped ? 'group-column-ungrouped' : `group-column-${groupId}`;
  const scrollRegionLabel = `Projects in ${groupName}`;

  return (
    <div
      id={columnId}
      data-group-id={groupId ?? 'ungrouped'}
      className="project-group-column flex flex-col shrink-0 w-72 max-w-full bg-slate-100/90 border border-slate-200 rounded-lg p-3 shadow-2xs"
    >
      <div className="group-column-header flex flex-col gap-1 pb-2 mb-2 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3
              className="text-sm font-bold text-slate-800 truncate m-0"
              title={groupName}
            >
              {groupName}
            </h3>
            <span
              className="text-[11px] font-semibold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded-full shrink-0"
              aria-label={`${projects.length} projects`}
            >
              {projects.length}
            </span>
          </div>
          {!isUngrouped && (
            <span
              className="text-[10px] font-mono text-slate-400 truncate shrink-0 max-w-[80px]"
              title={`Group ID: ${groupId}`}
            >
              {groupId}
            </span>
          )}
        </div>

        {!isUngrouped && (
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => onManageProjects?.(groupId)}
              disabled={disabled}
              aria-label={`Manage projects for ${groupName}`}
              className="btn-manage-group-projects px-2 py-0.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xs shadow-2xs hover:border-slate-400 focus:outline-hidden focus:ring-1 focus:ring-sky-500 disabled:opacity-50 cursor-pointer"
            >
              Manage Projects
            </button>
            <button
              type="button"
              onClick={() => onRenameGroup?.(groupId)}
              disabled={disabled}
              aria-label={`Rename group ${groupName}`}
              className="btn-rename-group px-2 py-0.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xs shadow-2xs hover:border-slate-400 focus:outline-hidden focus:ring-1 focus:ring-sky-500 disabled:opacity-50 cursor-pointer"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDeleteGroup?.(groupId)}
              disabled={disabled}
              aria-label={`Delete group ${groupName}`}
              className="btn-delete-group px-2 py-0.5 text-xs font-medium text-rose-700 bg-white hover:bg-rose-50 border border-rose-300 rounded-xs shadow-2xs hover:border-rose-400 focus:outline-hidden focus:ring-1 focus:ring-rose-500 disabled:opacity-50 cursor-pointer"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div
        role="region"
        aria-label={scrollRegionLabel}
        tabIndex={0}
        className="group-projects-list flex flex-col gap-2 overflow-y-auto max-h-[min(32rem,65vh)] min-h-0 p-1 rounded-md focus:outline-hidden focus:ring-2 focus:ring-sky-500/50"
      >
        {projects.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-6 px-2 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-md m-0">
            {isUngrouped ? 'No ungrouped projects' : 'No projects in this group'}
          </p>
        ) : (
          projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onToggleEnabled={onToggleEnabled}
              onChangeRunType={onChangeRunType}
            />
          ))
        )}
      </div>
    </div>
  );
}
