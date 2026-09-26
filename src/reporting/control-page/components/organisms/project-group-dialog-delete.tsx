import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../atoms/Button.js';

export interface ProjectGroupDialogDeleteProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onDeleteGroup: (groupId: string) => void;
}

export function ProjectGroupDialogDelete({
  groupId,
  groupName,
  onClose,
  onDeleteGroup,
}: ProjectGroupDialogDeleteProps) {
  const handleDeleteConfirm = () => {
    onDeleteGroup(groupId);
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <Dialog.Title
        id="group-dialog-title"
        className="text-lg font-bold text-slate-900 m-0"
      >
        Delete Group: {groupName}
      </Dialog.Title>
      <Dialog.Description
        id="group-dialog-desc"
        className="text-sm text-slate-600 m-0"
      >
        Are you sure you want to delete this group? All projects currently in this group will be moved to Ungrouped. No projects, reports, or configuration files will be deleted.
      </Dialog.Description>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          id="btn-cancel-delete-group"
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDeleteConfirm}
          id="btn-confirm-delete-group"
        >
          Delete Group
        </Button>
      </div>
    </div>
  );
}
