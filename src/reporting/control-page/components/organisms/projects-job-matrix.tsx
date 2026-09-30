import React, { useState } from 'react';
import { DEFAULT_JOB_COLUMN } from '../../../../config/project-job-matrix-upgrade.js';
import { PROJECT_CONFIG_LIMITS } from '../../../../config/project-config-schema.js';
import type { JobColumnInput, ProjectConfigDefaults, ProjectConfigDocumentV1 } from '../../types/index.js';
import {
  addJobColumn, addProjectMatrixDraft, cloneProjectMatrixDraft, removeJobColumn,
  renameJobColumn, setAllProjectsEnabled, setProjectJobSelections,
  toggleProjectJobSelection, updateJobCell,
} from '../../hooks/matrix-document-transitions.js';
import { MatrixEnabledHeader } from '../molecules/matrix-enabled-header.js';
import { removeProjectDocumentAt, updateProjectDocumentAt } from '../../hooks/config-document-transitions.js';
import { JobColumnHeader } from '../molecules/job-column-header.js';
import { MatrixToolbar } from './matrix-toolbar.js';
import { MatrixRow } from './matrix-row.js';
import { MatrixDialogs } from './matrix-dialogs.js';

export interface ProjectsJobMatrixProps {
  document: ProjectConfigDocumentV1 | null;
  validationErrors?: readonly string[];
  disabled?: boolean;
  onUpdateDocument?: (nextDoc: ProjectConfigDocumentV1) => void;
  onUpdateDefaults?: (update: (previous: ProjectConfigDefaults) => ProjectConfigDefaults) => void;
  className?: string;
}

export function ProjectsJobMatrix({
  document,
  validationErrors = [],
  disabled = false,
  onUpdateDocument,
  onUpdateDefaults,
  className = '',
}: ProjectsJobMatrixProps) {
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [isDefaultsOpen, setIsDefaultsOpen] = useState(false);
  const [activeSettingsIndex, setActiveSettingsIndex] = useState<number | null>(null);
  const [isIdColumnHidden, setIsIdColumnHidden] = useState(false);
  if (!document) {
    return React.createElement(
      'div',
      { className: 'p-8 text-center bg-white border border-slate-200 rounded-lg text-slate-500' },
      'No configuration loaded. Select a configuration file to begin.',
    );
  }

  const columns: readonly JobColumnInput[] = document.jobColumns ?? [DEFAULT_JOB_COLUMN];
  const projects = document.projects;
  const activeSettingsProject = activeSettingsIndex != null ? projects[activeSettingsIndex] : null;

  const emitUpdate = (nextDoc: ProjectConfigDocumentV1) => onUpdateDocument?.(nextDoc);
  const handleUpdateField = (index: number, field: 'id' | 'name' | 'enabled', value: string | boolean) => {
    emitUpdate(updateProjectDocumentAt(document, index, { [field]: value }));
  };

  const toolbar = React.createElement(MatrixToolbar, {
    projectCount: projects.length,
    columnCount: columns.length,
    disabled,
    isAtProjectCapacity: projects.length >= PROJECT_CONFIG_LIMITS.maxProjects,
    isAtColumnCapacity: columns.length >= 50,
    showIdColumn: !isIdColumnHidden,
    onToggleShowIdColumn: (show) => setIsIdColumnHidden(!show),
    onAddProject: () => {
      const res = addProjectMatrixDraft(document);
      if (res) emitUpdate(res.document);
    },
    onOpenAddColumn: () => setIsAddColumnOpen(true),
    onOpenDefaults: () => setIsDefaultsOpen(true),
  });

  const columnHeaders = columns.map((col, idx) => {
    const affected = projects.filter((p) => Boolean(p.jobs?.[col.id]?.trim())).length;
    return React.createElement(
      'th',
      { scope: 'col', key: col.id, className: 'p-2.5 min-w-48 border-l border-slate-200/80' },
      React.createElement(JobColumnHeader, {
        column: col,
        columnIndex: idx,
        totalColumns: columns.length,
        disabled,
        affectedRowCount: affected,
        onRename: (id, name) => emitUpdate(renameJobColumn(document, id, name)),
        onRemove: (id) => {
          const updated = removeJobColumn(document, id);
          if (updated) emitUpdate(updated);
        },
      }),
    );
  });

  const enabledCount = projects.filter((p) => p.enabled !== false).length;
  const allEnabled = projects.length > 0 && enabledCount === projects.length;
  const isIndeterminate = enabledCount > 0 && enabledCount < projects.length;

  const enabledHeader = React.createElement(MatrixEnabledHeader, {
    key: 'th-enabled',
    allEnabled,
    isIndeterminate,
    disabled: disabled || projects.length === 0,
    onToggleAll: () => {
      const next = allEnabled ? false : true;
      emitUpdate(setAllProjectsEnabled(document, next));
    },
  });

  const headerCells: React.ReactNode[] = [enabledHeader];
  if (!isIdColumnHidden) {
    headerCells.push(React.createElement('th', { scope: 'col', key: 'th-id', className: 'p-2.5 min-w-36' }, 'ID'));
  }
  headerCells.push(
    React.createElement('th', { scope: 'col', key: 'th-name', className: 'p-2.5 min-w-44' }, 'Name'),
    ...columnHeaders,
    React.createElement('th', { scope: 'col', key: 'th-targets', className: 'p-2.5 min-w-48 border-l border-slate-200/80' }, 'Targets'),
    React.createElement('th', { scope: 'col', key: 'th-actions', className: 'p-2.5 text-right w-24' }, 'Actions'),
  );

  const tableHeader = React.createElement(
    'thead',
    null,
    React.createElement(
      'tr',
      { className: 'border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider' },
      ...headerCells,
    ),
  );
  const tableRows = projects.map((project, idx) =>
    React.createElement(MatrixRow, {
      key: project.id || `idx-${idx}`,
      project,
      projectIndex: idx,
      columns,
      disabled,
      canRemove: projects.length > 1,
      validationErrors,
      onUpdateField: (field, val) => handleUpdateField(idx, field, val),
      onUpdateCell: (colId, url) => emitUpdate(updateJobCell(document, idx, colId, url)),
      isIdColumnHidden,
      onSetSelections: (colIds) => emitUpdate(setProjectJobSelections(document, idx, colIds)),
      onToggleSelection: (colId, sel) => emitUpdate(toggleProjectJobSelection(document, idx, colId, sel)),
      onOpenSettings: () => setActiveSettingsIndex(idx),
      onClone: () => {
        const res = cloneProjectMatrixDraft(document, project);
        if (res) emitUpdate(res.document);
      },
      onRemove: () => {
        const updated = removeProjectDocumentAt(document, idx);
        if (updated) emitUpdate(updated);
      },
    }),
  );

  const tableBody = React.createElement('tbody', null, ...tableRows);

  const table = React.createElement(
    'table',
    { className: 'w-full text-left border-collapse table-auto min-w-[700px]' },
    tableHeader,
    tableBody,
  );

  const scrollWrapper = React.createElement('div', { className: 'overflow-x-auto max-w-full' }, table);

  const dialogs = React.createElement(MatrixDialogs, {
    document,
    columns,
    isAddColumnOpen,
    isDefaultsOpen,
    activeSettingsIndex,
    activeSettingsProject,
    validationErrors,
    onCloseAddColumn: () => setIsAddColumnOpen(false),
    onCloseDefaults: () => setIsDefaultsOpen(false),
    onCloseSettings: () => setActiveSettingsIndex(null),
    onAddColumn: (col) => emitUpdate(addJobColumn(document, col)),
    onUpdateDefaults,
    onSaveProjectSettings: (idx, updated) => {
      emitUpdate(updateProjectDocumentAt(document, idx, updated));
      setActiveSettingsIndex(null);
    },
  });

  return React.createElement(
    'div',
    { id: 'projects-job-matrix', className: `flex flex-col bg-white border border-slate-200 rounded-lg shadow-xs ${className}` },
    toolbar,
    scrollWrapper,
    dialogs,
  );
}
