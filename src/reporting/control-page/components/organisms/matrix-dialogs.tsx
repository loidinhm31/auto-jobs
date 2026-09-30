import React from 'react';
import type {
  JobColumnInput,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../../types/index.js';
import { AddColumnDialog } from './add-column-dialog.js';
import { ConfigDefaultsDialog } from '../molecules/config-defaults-dialog.js';
import { MatrixRowSettings } from '../molecules/matrix-row-settings.js';

export interface MatrixDialogsProps {
  document: ProjectConfigDocumentV1;
  columns: readonly JobColumnInput[];
  isAddColumnOpen: boolean;
  isDefaultsOpen: boolean;
  activeSettingsIndex: number | null;
  activeSettingsProject: ProjectConfigInput | null | undefined;
  validationErrors?: readonly string[] | undefined;
  onCloseAddColumn: () => void;
  onCloseDefaults: () => void;
  onCloseSettings: () => void;
  onAddColumn: (column: JobColumnInput) => void;
  onUpdateDefaults?: ((updater: (prev: ProjectConfigDefaults) => ProjectConfigDefaults) => void) | undefined;
  onSaveProjectSettings: (index: number, updated: ProjectConfigInput) => void;
}

export function MatrixDialogs({
  document,
  columns,
  isAddColumnOpen,
  isDefaultsOpen,
  activeSettingsIndex,
  activeSettingsProject,
  validationErrors = [],
  onCloseAddColumn,
  onCloseDefaults,
  onCloseSettings,
  onAddColumn,
  onUpdateDefaults,
  onSaveProjectSettings,
}: MatrixDialogsProps) {
  const addColDialog = React.createElement(AddColumnDialog, {
    isOpen: isAddColumnOpen,
    existingColumns: columns,
    onClose: onCloseAddColumn,
    onAdd: onAddColumn,
  });

  const defaultsDialog = React.createElement(ConfigDefaultsDialog, {
    isOpen: isDefaultsOpen,
    defaults: document.defaults,
    validationErrors,
    onClose: onCloseDefaults,
    onUpdate: onUpdateDefaults ?? (() => { }),
  });

  const settingsDialog = activeSettingsProject && activeSettingsIndex != null
    ? React.createElement(MatrixRowSettings, {
      isOpen: true,
      project: activeSettingsProject,
      projectIndex: activeSettingsIndex,
      defaultsCredentials: document.defaults?.credentials,
      validationErrors,
      onClose: onCloseSettings,
      onSave: (updated) => onSaveProjectSettings(activeSettingsIndex, updated),
    })
    : null;

  return React.createElement(
    React.Fragment,
    null,
    addColDialog,
    defaultsDialog,
    settingsDialog,
  );
}
