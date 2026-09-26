import React, { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';

export interface ProjectGroupDialogCreateProps {
  onClose: () => void;
  onCreateGroup: (name?: string) => string | null;
  onSuccess: (createdGroupId: string) => void;
}

export function ProjectGroupDialogCreate({
  onClose,
  onCreateGroup,
  onSuccess,
}: ProjectGroupDialogCreateProps) {
  const [groupNameInput, setGroupNameInput] = useState('New Group');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputId = useId();

  const handleSubmit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const trimmed = groupNameInput.trim();
    if (!trimmed) {
      setErrorMsg('Group name cannot be blank.');
      return;
    }
    const createdId = onCreateGroup(trimmed);
    if (createdId) {
      onSuccess(createdId);
    } else {
      setErrorMsg('Failed to create group. Group limit (50) may have been reached.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Dialog.Title
        id="group-dialog-title"
        className="text-lg font-bold text-slate-900 m-0"
      >
        New Project Group
      </Dialog.Title>
      <Dialog.Description
        id="group-dialog-desc"
        className="text-sm text-slate-600 m-0"
      >
        Create an empty group in the current document. You can assign projects immediately after creation. Changes are saved as a draft until global Save.
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
          label="Group Name"
          value={groupNameInput}
          onChange={(e) => setGroupNameInput(e.target.value)}
          maxLength={200}
          placeholder="e.g. Core Services"
          autoFocus
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          id="btn-cancel-create-group"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          id="btn-confirm-create-group"
        >
          Create & Select Projects
        </Button>
      </div>
    </form>
  );
}
