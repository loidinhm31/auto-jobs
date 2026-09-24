import { useState } from 'react';
import type { AggregateProjectSummary, ProjectDeletionResult } from '../types/report-management-types.js';
import { useControlApi, ControlApiError } from './useControlApi.js';

export interface UseDeleteReportsOptions {
  onSuccess: () => Promise<void> | void;
  onFeedback: (msg: { type: 'success' | 'info' | 'error'; text: string }) => void;
}

export function useDeleteReports({ onSuccess, onFeedback }: UseDeleteReportsOptions) {
  const { requestJson } = useControlApi();
  const [targetProject, setTargetProject] = useState<AggregateProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDeleteDialog = (project: AggregateProjectSummary) => {
    setDeleteError(null);
    setTargetProject(project);
  };

  const closeDeleteDialog = () => {
    if (!isDeleting) {
      setTargetProject(null);
      setDeleteError(null);
    }
  };

  const confirmDelete = async () => {
    if (!targetProject || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const url = `/api/reports/projects/${encodeURIComponent(targetProject.projectId)}`;
      const { data } = await requestJson<ProjectDeletionResult>(url, { method: 'DELETE' });

      onFeedback({
        type: 'success',
        text: `Successfully deleted ${data.deletedRunsCount} historical run(s) for project ${data.projectId}.`,
      });
      setTargetProject(null);
      await onSuccess();
    } catch (err) {
      if (err instanceof ControlApiError) {
        if (err.status === 404) {
          onFeedback({
            type: 'info',
            text: 'Project reports were not found on disk. Refreshing inventory...',
          });
          setTargetProject(null);
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
      setDeleteError('An unexpected network or server error occurred while deleting project reports.');
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    targetProject,
    isDeleting,
    deleteError,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  };
}
