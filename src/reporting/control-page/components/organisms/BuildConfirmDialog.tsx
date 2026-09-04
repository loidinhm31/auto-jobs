import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ProjectCardData } from '../../types/component-contracts.js';
import { Button } from '../atoms/Button.js';

export interface BuildConfirmDialogProps {
  isOpen: boolean;
  project: ProjectCardData | null;
  onConfirm: (projectId: string) => void | Promise<void>;
  onCancel: () => void;
}

export function BuildConfirmDialog({
  isOpen,
  project,
  onConfirm,
  onCancel,
}: BuildConfirmDialogProps) {
  const handleConfirm = () => {
    if (project?.id) {
      void onConfirm(project.id);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 transition-opacity" />
        <Dialog.Content
          id="build-confirm-dialog"
          aria-labelledby="dialog-title"
          className="confirm-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[500px] w-full focus:outline-none"
        >
          <Dialog.Title asChild id="dialog-title">
            <h2 className="text-xl font-bold text-slate-900 mt-0 mb-2">Confirm Jenkins Auto-Build</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to trigger a Jenkins build for the following project?
            </p>
          </Dialog.Description>
          <dl className="dialog-details">
            <dt>Project ID:</dt>
            <dd id="confirm-project-id" className="m-0 font-mono text-slate-800">
              {project?.id ?? ''}
            </dd>
            <dt>Project Name:</dt>
            <dd id="confirm-project-name" className="m-0 text-slate-800">
              {project?.name || project?.id || ''}
            </dd>
            <dt>Target Job URL:</dt>
            <dd id="confirm-job-url" className="mono m-0 text-slate-800">
              {project?.jobUrl ?? ''}
            </dd>
          </dl>
          <div className="dialog-actions">
            <Button
              type="button"
              id="btn-cancel-build"
              variant="secondary"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              id="btn-confirm-build"
              variant="danger"
              onClick={handleConfirm}
            >
              Confirm & Submit Build
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
