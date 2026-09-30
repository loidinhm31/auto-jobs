import { useCallback, useState } from 'react';
import {
  PROJECT_CONFIG_LIMITS,
  assertProjectConfigDocument,
} from '../../../config/project-config-schema.js';
import { projectLegacyMatrixDocument } from '../../../config/project-job-matrix-upgrade.js';
import {
  addProjectDraft,
  removeProjectDocumentAt,
  updateProjectDocumentAt,
  updateProjectDocumentDefaults,
  updateProjectDocumentReportWorkers,
  type ProjectUpdate,
} from './config-document-transitions.js';
import { useMatrixEditorHandlers } from './use-matrix-editor-handlers.js';
import { useLegacyGroupHandlers } from './use-legacy-group-handlers.js';
import {
  getValidationErrors,
  type ValidationStatus,
} from '../utils/config-document-validation.js';
import type {
  JobColumnInput,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../types/index.js';
export interface UseConfigDocumentEditorResult {
  currentDoc: ProjectConfigDocumentV1 | null;
  rawJsonString: string;
  isDirty: boolean;
  jsonValidationMsg: ValidationStatus;
  validationErrors: string[];
  replacementRevision: number;
  setRawJsonString: (value: string) => void;
  setDocument: (document: ProjectConfigDocumentV1 | null, dirty?: boolean) => void;
  replaceDocument: (document: ProjectConfigDocumentV1 | null) => void;
  applyRawJson: (jsonString?: string) => boolean;
  validateCurrentDocument: () => boolean;
  updateProject: (projectId: string, update: ProjectUpdate) => void;
  updateProjectAt: (projectIndex: number, update: ProjectUpdate) => void;
  addProject: (projectInput?: ProjectConfigInput) => string | null;
  removeProjectAt: (projectIndex: number) => boolean;
  updateDefaults: (update: (previous: ProjectConfigDefaults) => ProjectConfigDefaults) => void;
  updateReportWorkers: (count: number) => void;
  addJobColumn: (column: JobColumnInput) => void;
  renameJobColumn: (columnId: string, newName: string) => void;
  removeJobColumn: (columnId: string) => boolean;
  updateJobCell: (projectIndex: number, columnId: string, url: string) => void;
  toggleProjectJobSelection: (projectIndex: number, columnId: string, selected: boolean) => void;
  setProjectJobSelections: (projectIndex: number, columnIds: readonly string[]) => void;
  setAllProjectsEnabled: (enabled: boolean) => void;
  addProjectMatrixDraft: () => string | null;
  cloneProjectMatrixDraft: (sourceProject: ProjectConfigInput) => string | null;
  createGroup: (name?: string) => string | null;
  renameGroup: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  setGroupMembership: (groupId: string, selectedProjectIds: readonly string[]) => void;
}

export function useConfigDocumentEditor(): UseConfigDocumentEditorResult {
  const [currentDoc, setCurrentDoc] = useState<ProjectConfigDocumentV1 | null>(null);
  const [rawJsonString, setRawJsonString] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [jsonValidationMsg, setJsonValidationMsg] = useState<ValidationStatus>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [replacementRevision, setReplacementRevision] = useState(0);

  const setDocument = useCallback((document: ProjectConfigDocumentV1 | null, dirty = false) => {
    const errors = getValidationErrors(document);
    setCurrentDoc(document);
    setRawJsonString(document ? JSON.stringify(document, null, 2) : '');
    setValidationErrors(errors);
    setIsDirty(dirty);
    setJsonValidationMsg(dirty ? {
      isValid: errors.length === 0,
      message: errors.length === 0
        ? 'Configuration changes are valid.'
        : `Configuration has ${errors.length} validation error(s). Fix them before saving.`,
    } : null);
  }, []);
  const replaceDocument = useCallback((document: ProjectConfigDocumentV1 | null) => {
    setDocument(document, false);
    setReplacementRevision((rev) => rev + 1);
  }, [setDocument]);


  const applyRawJson = useCallback((explicitJsonString?: string): boolean => {
    const text = explicitJsonString ?? rawJsonString;
    if (explicitJsonString !== undefined) setRawJsonString(explicitJsonString);
    try {
      const parsed = JSON.parse(text) as unknown;
      const validated = assertProjectConfigDocument(parsed);
      const projected = projectLegacyMatrixDocument(validated as unknown as ProjectConfigDocumentV1);
      setDocument(projected, true);
      setReplacementRevision((rev) => rev + 1);
      setJsonValidationMsg({ isValid: true, message: 'JSON valid and applied to model.' });
      return true;
    } catch (error) {
      setJsonValidationMsg({
        isValid: false,
        message: `Invalid JSON or configuration: ${error instanceof Error ? error.message : String(error)}`,
      });
      return false;
    }
  }, [rawJsonString, setDocument]);

  const validateCurrentDocument = useCallback((): boolean => {
    if (!currentDoc) {
      setValidationErrors([]);
      setJsonValidationMsg(null);
      return false;
    }
    const errors = getValidationErrors(currentDoc);
    setValidationErrors(errors);
    if (errors.length > 0) {
      setJsonValidationMsg({ isValid: false, message: 'Configuration is invalid. Fix the indicated fields before saving.' });
      return false;
    }
    setJsonValidationMsg({ isValid: true, message: 'Configuration is valid.' });
    return true;
  }, [currentDoc]);

  const updateProjectAt = useCallback((projectIndex: number, update: ProjectUpdate): void => {
    if (!currentDoc) return;
    const updated = updateProjectDocumentAt(currentDoc, projectIndex, update);
    if (updated !== currentDoc) setDocument(updated, true);
  }, [currentDoc, setDocument]);

  const updateProject = useCallback((projectId: string, update: ProjectUpdate): void => {
    const projectIndex = currentDoc?.projects.findIndex((project) => project.id === projectId) ?? -1;
    if (projectIndex >= 0) updateProjectAt(projectIndex, update);
  }, [currentDoc, updateProjectAt]);

  const addProject = useCallback((projectInput?: ProjectConfigInput): string | null => {
    if (!currentDoc) return null;
    if (projectInput) {
      if (currentDoc.projects.length >= PROJECT_CONFIG_LIMITS.maxProjects) return null;
      if (currentDoc.projects.some((project) => project.id === projectInput.id)) return null;
      const nextDoc: ProjectConfigDocumentV1 = {
        ...currentDoc,
        projects: [...currentDoc.projects, projectInput],
      };
      setDocument(nextDoc, true);
      return projectInput.id;
    }
    const added = addProjectDraft(currentDoc);
    if (!added) return null;
    setDocument(added.document, true);
    return added.projectId;
  }, [currentDoc, setDocument]);

  const removeProjectAt = useCallback((projectIndex: number): boolean => {
    if (!currentDoc) return false;
    const updated = removeProjectDocumentAt(currentDoc, projectIndex);
    if (!updated) return false;
    setDocument(updated, true);
    return true;
  }, [currentDoc, setDocument]);

  const updateDefaults = useCallback((update: (previous: ProjectConfigDefaults) => ProjectConfigDefaults): void => {
    if (currentDoc) setDocument(updateProjectDocumentDefaults(currentDoc, update), true);
  }, [currentDoc, setDocument]);
  const updateReportWorkers = useCallback((count: number): void => {
    if (currentDoc) setDocument(updateProjectDocumentReportWorkers(currentDoc, count), true);
  }, [currentDoc, setDocument]);
  const groupHandlers = useLegacyGroupHandlers(currentDoc, setDocument);
  const matrixHandlers = useMatrixEditorHandlers(currentDoc, setDocument);

  return {
    currentDoc,
    rawJsonString,
    isDirty,
    jsonValidationMsg,
    validationErrors,
    setRawJsonString,
    setDocument,
    applyRawJson,
    validateCurrentDocument,
    updateProject,
    updateProjectAt,
    addProject,
    removeProjectAt,
    updateDefaults,
    updateReportWorkers,
    replacementRevision,
    replaceDocument,
    ...matrixHandlers,
    ...groupHandlers,
  };
}
