import React, { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';

export interface ProjectGroupDialogRenameProps {
  groupId: string;
  initialName: string;
  onClose: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
}

export function ProjectGroupDialogRename({
  groupId,
  initialName,
  onClose,
  onRenameGroup,
}: ProjectGroupDialogRenameProps) {
  const [renameInput, setRenameInput] = useState(initialName);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputId = useId();

  const handleSubmit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setErrorMsg('Group name cannot be blank.');
      return;
    }
    onRenameGroup(groupId, trimmed);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Dialog.Title
        id="group-dialog-title"
        className="text-lg font-bold text-slate-900 m-0"
      >
        Rename Group
      </Dialog.Title>
      <Dialog.Description
        id="group-dialog-desc"
        className="text-sm text-slate-600 m-0"
      >
        Update the display name for group{' '}
        <strong className="text-slate-800">{initialName}</strong> (ID: {groupId}).
      </Dialog.Description>

      {errorMsg && (
        <div
          role="alert"
          className="text-xs text-red-600 bg-red-50 p-2 rounded-xs border border-red-200"
        >
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Input
          id={inputId}
          label="New Group Name"
          value={renameInput}
          onChange={(e) => setRenameInput(e.target.value)}
          maxLength={200}
          autoFocus
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          id="btn-cancel-rename-group"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          id="btn-confirm-rename-group"
        >
          Save Rename
        </Button>
      </div>
    </form>
  );
}
