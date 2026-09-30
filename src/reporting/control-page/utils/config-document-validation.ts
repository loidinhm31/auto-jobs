import { ConfigError } from '../../../config-errors.js';
import { assertProjectConfigDocument } from '../../../config/project-config-schema.js';
import type { ProjectConfigDocumentV1 } from '../types/index.js';

export type ValidationStatus = { isValid: boolean; message: string } | null;

/**
 * Validates a ProjectConfigDocumentV1 against the schema and returns an array of issues.
 * Returns an empty array if valid or document is null.
 */
export function getValidationErrors(document: ProjectConfigDocumentV1 | null): string[] {
 if (!document) return [];
 try {
  assertProjectConfigDocument(document);
  return [];
 } catch (error) {
  if (error instanceof ConfigError) return [...error.issues];
  return [error instanceof Error ? error.message : String(error)];
 }
}
