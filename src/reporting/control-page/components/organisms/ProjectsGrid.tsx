import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectCardData } from '../../types/component-contracts.js';
import type { ProjectGroupInput } from '../../types/index.js';
import { buildProjectGroupColumns } from '../../utils/project-group-board.js';
import { Button } from '../atoms/Button.js';
import { ProjectGroupColumn } from './project-group-column.js';
import {
  ProjectGroupEditorDialog,
  type GroupDialogMode,
} from './project-group-editor-dialog.js';
import { cn } from '../../utils/cn.js';

export interface ProjectsGridProps {
  projects: readonly ProjectCardData[];
  groups?: readonly ProjectGroupInput[];
  disabled?: boolean;
  replacementRevision?: number;
  onToggleEnabled: (projectId: string, enabled: boolean) => void;
  onChangeRunType: (projectId: string, runType: 'report' | 'auto-build') => void;
  onCreateGroup?: (name?: string) => string | null;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onSetGroupMembership?: (groupId: string, selectedProjectIds: readonly string[]) => void;
  className?: string;
}

export function ProjectsGrid({
  projects,
  groups = [],
  disabled = false,
  replacementRevision = 0,
  onToggleEnabled,
  onChangeRunType,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetGroupMembership,
  className,
}: ProjectsGridProps) {
  const [dialogMode, setDialogMode] = useState<GroupDialogMode | null>(null);
  const prevRevisionRef = useRef(replacementRevision);

  // Reset dialog on replacement revision change
  useEffect(() => {
    if (prevRevisionRef.current !== replacementRevision) {
      prevRevisionRef.current = replacementRevision;
      setDialogMode(null);
    }
  }, [replacementRevision]);

  // Build group buckets in one pass using Map; Ungrouped plus root group order.
  const columns = useMemo(
    () => buildProjectGroupColumns(projects, groups),
    [groups, projects],
  );

  const hasGroups = groups.length > 0;

  return (
    <div className="projects-board-container flex flex-col gap-3 min-w-0 max-w-full">
      {/* Board toolbar */}
      <div className="projects-board-toolbar flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">
            {hasGroups
              ? `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · `
              : ''}
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>

        {onCreateGroup && (
          <div className="flex items-center gap-2">
            <Button
              id="btn-new-group"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => setDialogMode({ type: 'new-group' })}
              className="btn-new-group font-medium text-xs flex items-center gap-1"
            >
              <span aria-hidden="true">+</span> New Group
            </Button>
          </div>
        )}
      </div>

      {/* Group columns board with horizontal scroll */}
      <div
        id="projects-list"
        role="region"
        aria-label="Project groups board"
        tabIndex={0}
        className={cn(
          'projects-grid projects-board flex flex-row items-start gap-4 pb-2 min-w-0 max-w-full overflow-x-auto focus:outline-hidden focus:ring-2 focus:ring-sky-500/50 rounded-lg',
          className,
        )}
      >
        {columns.map((column) => (
          <ProjectGroupColumn
            key={column.groupId ?? 'ungrouped'}
            groupId={column.groupId}
            groupName={column.groupName}
            projects={column.projects}
            onToggleEnabled={onToggleEnabled}
            onChangeRunType={onChangeRunType}
            onManageProjects={(groupId) =>
              setDialogMode({ type: 'manage-projects', groupId })
            }
            onRenameGroup={(groupId) => setDialogMode({ type: 'rename', groupId })}
            onDeleteGroup={(groupId) => setDialogMode({ type: 'delete', groupId })}
            disabled={disabled}
          />
        ))}
      </div>

      <ProjectGroupEditorDialog
        mode={dialogMode}
        groups={groups}
        projects={projects}
        onClose={() => setDialogMode(null)}
        onModeChange={setDialogMode}
        onCreateGroup={onCreateGroup ?? (() => null)}
        onRenameGroup={onRenameGroup ?? (() => {})}
        onDeleteGroup={onDeleteGroup ?? (() => {})}
        onSetGroupMembership={onSetGroupMembership ?? (() => {})}
      />
    </div>
  );
}
