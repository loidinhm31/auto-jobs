import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../atoms/Button.js';

export interface DeleteReportsConfirmationDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  projectId: string | null;
  projectName: string | null;
  runsCount: number;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function DeleteReportsConfirmationDialog({
  isOpen,
  isLoading,
  projectId,
  projectName,
  runsCount,
  errorMessage,
  onClose,
  onConfirm,
}: DeleteReportsConfirmationDialogProps) {
  const displayName = projectName || projectId || 'this project';

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 transition-opacity" />
        <Dialog.Content
          id="delete-reports-dialog"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-description"
          className="confirm-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[540px] w-[90vw] focus:outline-none"
        >
          <div className="dialog-content flex flex-col gap-4">
            <Dialog.Title
              id="delete-dialog-title"
              className="text-lg font-bold text-slate-900 m-0"
            >
              Delete Project Reports
            </Dialog.Title>

            <Dialog.Description
              id="delete-dialog-description"
              className="text-sm text-slate-600 m-0 leading-relaxed"
            >
              All {runsCount} historical report files for{' '}
              <strong className="text-slate-900">{displayName}</strong>{' '}
              {projectId ? (
                <code className="text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">
                  {projectId}
                </code>
              ) : null}{' '}
              will be permanently removed from disk. Project configuration and
              reports for other projects will remain untouched.
            </Dialog.Description>

            {errorMessage ? (
              <div
                id="delete-error-message"
                role="alert"
                className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded"
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="flex justify-end items-center gap-3 pt-2 border-t border-slate-200">
              <Button
                id="cancel-delete-btn"
                variant="secondary"
                disabled={isLoading}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                id="confirm-delete-btn"
                variant="danger"
                loading={isLoading}
                disabled={isLoading}
                onClick={() => void onConfirm()}
              >
                Delete Reports
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
