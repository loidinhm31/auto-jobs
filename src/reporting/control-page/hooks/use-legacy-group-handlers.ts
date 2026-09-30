import { useCallback } from 'react';
import type { ProjectConfigDocumentV1 } from '../types/index.js';
import {
 createProjectGroup,
 deleteProjectGroup,
 renameProjectGroup,
 replaceGroupMembership,
} from './project-group-transitions.js';

export interface LegacyGroupHandlers {
 createGroup: (name?: string) => string | null;
 renameGroup: (groupId: string, name: string) => void;
 deleteGroup: (groupId: string) => void;
 setGroupMembership: (groupId: string, selectedProjectIds: readonly string[]) => void;
}

/**
 * Legacy group operations retained for backward compatibility with existing tests
 * until caller migrations complete.
 */
export function useLegacyGroupHandlers(
 currentDoc: ProjectConfigDocumentV1 | null,
 setDocument: (document: ProjectConfigDocumentV1 | null, dirty?: boolean) => void,
): LegacyGroupHandlers {
 const createGroup = useCallback((name?: string): string | null => {
  if (!currentDoc) return null;
  const result = createProjectGroup(currentDoc, name);
  if (!result) return null;
  setDocument(result.document, true);
  return result.groupId;
 }, [currentDoc, setDocument]);

 const renameGroup = useCallback((groupId: string, name: string): void => {
  if (!currentDoc) return;
  const updated = renameProjectGroup(currentDoc, groupId, name);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);

 const deleteGroup = useCallback((groupId: string): void => {
  if (!currentDoc) return;
  const updated = deleteProjectGroup(currentDoc, groupId);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);

 const setGroupMembership = useCallback((groupId: string, selectedProjectIds: readonly string[]): void => {
  if (!currentDoc) return;
  const updated = replaceGroupMembership(currentDoc, groupId, selectedProjectIds);
  if (updated !== currentDoc) setDocument(updated, true);
 }, [currentDoc, setDocument]);

 return { createGroup, renameGroup, deleteGroup, setGroupMembership };
}
