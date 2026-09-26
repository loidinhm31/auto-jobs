import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../atoms/Button.js';
import type { ProjectCardData } from '../../types/component-contracts.js';
import type { ProjectGroupInput } from '../../types/index.js';

export interface ProjectGroupDialogMembershipProps {
  groupId: string;
  groupName: string;
  groups: readonly ProjectGroupInput[];
  projects: readonly ProjectCardData[];
  onClose: () => void;
  onSetGroupMembership: (groupId: string, selectedProjectIds: readonly string[]) => void;
}

export function ProjectGroupDialogMembership({
  groupId,
  groupName,
  groups,
  projects,
  onClose,
  onSetGroupMembership,
}: ProjectGroupDialogMembershipProps) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const p of projects) {
      if (p.groupId === groupId) {
        initial.add(p.id);
      }
    }
    return initial;
  });

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleApply = () => {
    const groupExists = groups.some((g) => g.id === groupId);
    if (!groupExists) {
      onClose();
      return;
    }

    const validIds = Array.from(selectedProjectIds).filter((id) =>
      projects.some((p) => p.id === id),
    );
    onSetGroupMembership(groupId, validIds);
    onClose();
  };

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <Dialog.Title
        id="group-dialog-title"
        className="text-lg font-bold text-slate-900 m-0"
      >
        Manage Projects: {groupName}
      </Dialog.Title>
      <Dialog.Description
        id="group-dialog-desc"
        className="text-sm text-slate-600 m-0"
      >
        Check projects to include in this group. Moving a project here removes it from its previous group. Unchecked projects return to Ungrouped.
      </Dialog.Description>

      <div
        role="region"
        aria-label={`Project selection for ${groupName}`}
        tabIndex={0}
        className="flex flex-col gap-1.5 overflow-y-auto max-h-[42vh] p-2 border border-slate-200 rounded-md bg-slate-50/50 focus:outline-hidden focus:ring-2 focus:ring-sky-500/50"
      >
        {projects.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center m-0">
            No projects available in document.
          </p>
        ) : (
          projects.map((p) => {
            const isChecked = selectedProjectIds.has(p.id);
            const currentOwner = p.groupId
              ? groups.find((g) => g.id === p.groupId)?.name ?? p.groupId
              : 'Ungrouped';
            const isCurrentGroup = p.groupId === groupId;

            return (
              <label
                key={p.id}
                className="flex items-center justify-between gap-3 p-2 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    id={`group-project-${p.id}`}
                    checked={isChecked}
                    onChange={() => toggleProject(p.id)}
                    className="h-4 w-4 rounded-xs border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-800 truncate">
                      {p.name || p.id}
                    </span>
                    <span className="mono font-mono text-[10px] text-slate-500">
                      {p.id}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-xs shrink-0 ${
                    isCurrentGroup
                      ? 'bg-sky-100 text-sky-800 font-medium'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isCurrentGroup ? 'Current member' : currentOwner}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          id="btn-cancel-manage-projects"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleApply}
          id="btn-apply-manage-projects"
        >
          Apply Changes
        </Button>
      </div>
    </div>
  );
}
