import { useState } from 'react';
import type { TargetRunToDelete, RunDeletionResult } from '../types/report-management-types.js';
import { useControlApi, ControlApiError } from './useControlApi.js';

export interface UseDeleteRunOptions {
  onSuccess: () => Promise<void> | void;
  onFeedback: (msg: { type: 'success' | 'info' | 'error'; text: string }) => void;
}

export function useDeleteRun({ onSuccess, onFeedback }: UseDeleteRunOptions) {
  const { requestJson } = useControlApi();
  const [targetRun, setTargetRun] = useState<TargetRunToDelete | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDeleteDialog = (run: TargetRunToDelete) => {
    setDeleteError(null);
    setTargetRun(run);
  };

  const closeDeleteDialog = () => {
    if (!isDeleting) {
      setTargetRun(null);
      setDeleteError(null);
    }
  };

  const confirmDelete = async () => {
    if (!targetRun || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const url = `/api/reports/projects/${encodeURIComponent(targetRun.projectId)}/runs/${encodeURIComponent(targetRun.runId)}`;
      await requestJson<RunDeletionResult>(url, { method: 'DELETE' });

      onFeedback({
        type: 'success',
        text: `Successfully deleted report run ${targetRun.runId} for ${targetRun.projectName}.`,
      });
      setTargetRun(null);
      await onSuccess();
    } catch (err) {
      if (err instanceof ControlApiError) {
        if (err.status === 404) {
          onFeedback({
            type: 'info',
            text: `Report run ${targetRun.runId} was not found on disk. Refreshing inventory...`,
          });
          setTargetRun(null);
          await onSuccess();
          return;
        }
        if (err.status === 409) {
          setDeleteError('Server is currently busy or another operation holds the report lock. Please retry manually.');
          return;
        }
        setDeleteError(`Deletion failed: ${err.message}. Disk state may have been partially modified.`);
        return;
      }
      setDeleteError('An unexpected network or server error occurred while deleting the report run.');
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    targetRun,
    isDeleting,
    deleteError,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  };
}
