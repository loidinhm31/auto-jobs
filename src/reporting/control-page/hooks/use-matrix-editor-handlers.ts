import { useCallback } from 'react';
import type {
 JobColumnInput,
 ProjectConfigDocumentV1,
 ProjectConfigInput,
} from '../types/index.js';
import {
 addJobColumn as addJobColumnTransition,
 renameJobColumn as renameJobColumnTransition,
 removeJobColumn as removeJobColumnTransition,
 updateJobCell as updateJobCellTransition,
 toggleProjectJobSelection as toggleProjectJobSelectionTransition,
 setProjectJobSelections as setProjectJobSelectionsTransition,
 setAllProjectsEnabled as setAllProjectsEnabledTransition,
 addProjectMatrixDraft as addProjectMatrixDraftTransition,
 cloneProjectMatrixDraft as cloneProjectMatrixDraftTransition,
} from './matrix-document-transitions.js';

export interface MatrixEditorHandlers {
 addJobColumn: (column: JobColumnInput) => void;
 renameJobColumn: (columnId: string, newName: string) => void;
 removeJobColumn: (columnId: string) => boolean;
 updateJobCell: (projectIndex: number, columnId: string, url: string) => void;
 toggleProjectJobSelection: (projectIndex: number, columnId: string, selected: boolean) => void;
 setProjectJobSelections: (projectIndex: number, columnIds: readonly string[]) => void;
 setAllProjectsEnabled: (enabled: boolean) => void;
 addProjectMatrixDraft: () => string | null;
 cloneProjectMatrixDraft: (sourceProject: ProjectConfigInput) => string | null;
}

/**
 * Matrix editor transition callbacks dispatched against the current configuration document.
 */
export function useMatrixEditorHandlers(
 currentDoc: ProjectConfigDocumentV1 | null,
 setDocument: (document: ProjectConfigDocumentV1 | null, dirty?: boolean) => void,
): MatrixEditorHandlers {
 const addJobColumn = useCallback((column: JobColumnInput): void => {
  if (!currentDoc) return;
  const updated = addJobColumnTransition(currentDoc, column);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);

 const renameJobColumn = useCallback((columnId: string, newName: string): void => {
  if (!currentDoc) return;
  const updated = renameJobColumnTransition(currentDoc, columnId, newName);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);

 const removeJobColumn = useCallback((columnId: string): boolean => {
  if (!currentDoc) return false;
  const updated = removeJobColumnTransition(currentDoc, columnId);
  if (!updated || updated === currentDoc) return false;
  setDocument(updated, true);
  return true;
 }, [currentDoc, setDocument]);

 const updateJobCell = useCallback((projectIndex: number, columnId: string, url: string): void => {
  if (!currentDoc) return;
  const updated = updateJobCellTransition(currentDoc, projectIndex, columnId, url);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);

 const toggleProjectJobSelection = useCallback((projectIndex: number, columnId: string, selected: boolean): void => {
  if (!currentDoc) return;
  const updated = toggleProjectJobSelectionTransition(currentDoc, projectIndex, columnId, selected);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);
 const setProjectJobSelections = useCallback((projectIndex: number, columnIds: readonly string[]): void => {
  if (!currentDoc) return;
  const updated = setProjectJobSelectionsTransition(currentDoc, projectIndex, columnIds);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);

 const setAllProjectsEnabled = useCallback((enabled: boolean): void => {
  if (!currentDoc) return;
  const updated = setAllProjectsEnabledTransition(currentDoc, enabled);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);


 const addProjectMatrixDraft = useCallback((): string | null => {
  if (!currentDoc) return null;
  const result = addProjectMatrixDraftTransition(currentDoc);
  if (!result) return null;
  setDocument(result.document, true);
  return result.projectId;
 }, [currentDoc, setDocument]);

 const cloneProjectMatrixDraft = useCallback((sourceProject: ProjectConfigInput): string | null => {
  if (!currentDoc) return null;
  const result = cloneProjectMatrixDraftTransition(currentDoc, sourceProject);
  if (!result) return null;
  setDocument(result.document, true);
  return result.projectId;
 }, [currentDoc, setDocument]);

 return {
  addJobColumn,
  renameJobColumn,
  removeJobColumn,
  updateJobCell,
  toggleProjectJobSelection,
  setProjectJobSelections,
  setAllProjectsEnabled,
  addProjectMatrixDraft,
  cloneProjectMatrixDraft,
 };
}
