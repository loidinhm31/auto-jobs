import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ProjectCardData } from '../../types/component-contracts.js';
import type { ProjectGroupInput } from '../../types/index.js';
import { ProjectGroupDialogCreate } from './project-group-dialog-create.js';
import { ProjectGroupDialogMembership } from './project-group-dialog-membership.js';
import { ProjectGroupDialogRename } from './project-group-dialog-rename.js';
import { ProjectGroupDialogDelete } from './project-group-dialog-delete.js';

export type GroupDialogMode =
  | { type: 'new-group' }
  | { type: 'manage-projects'; groupId: string }
  | { type: 'rename'; groupId: string }
  | { type: 'delete'; groupId: string };

export interface ProjectGroupEditorDialogProps {
  mode: GroupDialogMode | null;
  groups: readonly ProjectGroupInput[];
  projects: readonly ProjectCardData[];
  onClose: () => void;
  onModeChange: (mode: GroupDialogMode | null) => void;
  onCreateGroup: (name?: string) => string | null;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSetGroupMembership: (groupId: string, selectedProjectIds: readonly string[]) => void;
}

export function ProjectGroupEditorDialog({
  mode,
  groups,
  projects,
  onClose,
  onModeChange,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetGroupMembership,
}: ProjectGroupEditorDialogProps) {
  const isOpen = mode !== null;

  // Resolve target group for active mode
  const activeGroupId = mode && 'groupId' in mode ? mode.groupId : null;
  const activeGroup = activeGroupId
    ? groups.find((g) => g.id === activeGroupId)
    : null;
  const activeGroupName = activeGroup?.name ?? activeGroupId ?? '';

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 transition-opacity" />
        <Dialog.Content
          id="project-group-dialog"
          aria-labelledby="group-dialog-title"
          aria-describedby="group-dialog-desc"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[560px] w-[92vw] focus:outline-hidden max-h-[90vh] flex flex-col"
        >
          {mode?.type === 'new-group' && (
            <ProjectGroupDialogCreate
              onClose={onClose}
              onCreateGroup={onCreateGroup}
              onSuccess={(createdId) =>
                onModeChange({ type: 'manage-projects', groupId: createdId })
              }
            />
          )}

          {mode?.type === 'manage-projects' && (
            <ProjectGroupDialogMembership
              groupId={mode.groupId}
              groupName={activeGroupName}
              groups={groups}
              projects={projects}
              onClose={onClose}
              onSetGroupMembership={onSetGroupMembership}
            />
          )}

          {mode?.type === 'rename' && (
            <ProjectGroupDialogRename
              groupId={mode.groupId}
              initialName={activeGroupName}
              onClose={onClose}
              onRenameGroup={onRenameGroup}
            />
          )}

          {mode?.type === 'delete' && (
            <ProjectGroupDialogDelete
              groupId={mode.groupId}
              groupName={activeGroupName}
              onClose={onClose}
              onDeleteGroup={onDeleteGroup}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
