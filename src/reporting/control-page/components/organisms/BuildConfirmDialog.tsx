import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ProjectCardData } from '../../types/component-contracts.js';
import { Button } from '../atoms/Button.js';

export interface BuildConfirmDialogProps {
  isOpen: boolean;
  project: ProjectCardData | null;
  onConfirm: (projectId: string, waitForCompletion?: boolean, waitTimeoutMs?: number) => void | Promise<void>;
  onCancel: () => void;
}

export function BuildConfirmDialog({
  isOpen,
  project,
  onConfirm,
  onCancel,
}: BuildConfirmDialogProps) {
  const [waitForCompletion, setWaitForCompletion] = useState<boolean>(true);
  const [waitTimeoutMinutes, setWaitTimeoutMinutes] = useState<number>(15);

  useEffect(() => {
    setWaitForCompletion(project?.waitForCompletion !== false);
    setWaitTimeoutMinutes(project?.waitTimeoutMs ? Math.round(project.waitTimeoutMs / 60000) : 15);
  }, [project]);

  const handleConfirm = () => {
    if (project?.id) {
      const waitTimeoutMs = waitForCompletion && waitTimeoutMinutes > 0 ? waitTimeoutMinutes * 60 * 1000 : undefined;
      void onConfirm(project.id, waitForCompletion, waitTimeoutMs);
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
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center gap-2">
            <input
              type="checkbox"
              id="checkbox-wait-for-completion"
              checked={waitForCompletion}
              onChange={(e) => setWaitForCompletion(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="checkbox-wait-for-completion" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
              Wait for build completion in Stage View
            </label>
          </div>
          {waitForCompletion && (
            <div className="mt-2.5 pl-6 flex items-center gap-2">
              <label htmlFor="input-wait-timeout-minutes" className="text-xs font-medium text-slate-600">
                Timeout (minutes):
              </label>
              <input
                type="number"
                id="input-wait-timeout-minutes"
                min={1}
                max={120}
                value={waitTimeoutMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setWaitTimeoutMinutes(isNaN(val) ? 15 : val);
                }}
                className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-400">(auto-detects from prior build if left blank)</span>
            </div>
          )}
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
