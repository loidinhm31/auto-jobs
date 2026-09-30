import React from 'react';
import { Settings, Copy, Trash2 } from 'lucide-react';
import type {
  JobColumnInput,
  ProjectConfigInput,
} from '../../types/index.js';
import { ProjectJobCell } from '../molecules/project-job-cell.js';
import { ProjectJobSelection } from '../molecules/project-job-selection.js';

export interface MatrixRowProps {
  project: ProjectConfigInput;
  projectIndex: number;
  columns: readonly JobColumnInput[];
  disabled?: boolean;
  canRemove?: boolean;
  isIdColumnHidden?: boolean | undefined;
  validationErrors?: readonly string[] | undefined;
  onUpdateField: (field: 'id' | 'name' | 'enabled', value: string | boolean) => void;
  onUpdateCell: (columnId: string, url: string) => void;
  onToggleSelection: (columnId: string, selected: boolean) => void;
  onSetSelections?: ((columnIds: readonly string[]) => void) | undefined;
  onOpenSettings: () => void;
  onClone: () => void;
  onRemove: () => void;
}
export function MatrixRow({
  project,
  projectIndex,
  columns,
  disabled = false,
  canRemove = true,
  isIdColumnHidden = false,
  validationErrors = [],
  onUpdateField,
  onUpdateCell,
  onToggleSelection,
  onSetSelections,
  onOpenSettings,
  onClone,
  onRemove,
}: MatrixRowProps) {
  const isEnabled = project.enabled !== false;
  const projectErrorPrefix = `projects[${projectIndex}].`;
  const idError = validationErrors.find((e) => e.startsWith(`${projectErrorPrefix}id `));
  const nameError = validationErrors.find((e) => e.startsWith(`${projectErrorPrefix}name `));

  const enabledCheckbox = React.createElement('input', {
    type: 'checkbox',
    id: `checkbox-enabled-${project.id}`,
    name: `enabled-${project.id}`,
    checked: isEnabled,
    disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onUpdateField('enabled', e.target.checked),
    title: isEnabled ? 'Disable project' : 'Enable project',
    'aria-label': `Enable or disable ${project.name || project.id}`,
    className: 'h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 accent-sky-700 cursor-pointer',
  });
  const enabledCell = React.createElement('td', { className: 'p-2.5 text-center w-10' }, enabledCheckbox);

  const idInput = React.createElement('input', {
    type: 'text', id: `input-project-id-${project.id}`, value: project.id, disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onUpdateField('id', e.target.value),
    'aria-label': `Project ID for ${project.name || project.id}`, 'aria-invalid': Boolean(idError),
    className: `w-full text-xs font-mono px-2 py-1 bg-white border rounded focus:outline-none focus:ring-1 ${idError ? 'border-red-400 text-red-900 focus:ring-red-400' : 'border-slate-300 text-slate-800 focus:ring-sky-500'}`,
  });
  const idErrorSpan = idError ? React.createElement('span', { className: 'text-[10px] text-red-600 font-medium', role: 'alert' }, idError) : null;
  const idCell = React.createElement('td', { className: 'p-2.5 min-w-36 align-top' }, React.createElement('div', { className: 'flex flex-col gap-0.5' }, idInput, idErrorSpan));

  const nameInput = React.createElement('input', {
    type: 'text', id: `input-project-name-${project.id}`, value: project.name, disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onUpdateField('name', e.target.value),
    'aria-label': `Project Name for ${project.id}`, 'aria-invalid': Boolean(nameError),
    className: `w-full text-xs px-2 py-1 bg-white border rounded focus:outline-none focus:ring-1 ${nameError ? 'border-red-400 text-red-900 focus:ring-red-400' : 'border-slate-300 text-slate-800 focus:ring-sky-500'}`,
  });
  const nameErrorSpan = nameError ? React.createElement('span', { className: 'text-[10px] text-red-600 font-medium', role: 'alert' }, nameError) : null;
  const nameCell = React.createElement('td', { className: 'p-2.5 min-w-44 align-top' }, React.createElement('div', { className: 'flex flex-col gap-0.5' }, nameInput, nameErrorSpan));

  const jobCells = columns.map((col, idx) => {
    const cellUrl = project.jobs?.[col.id] ?? '';
    const cellError = validationErrors.find(
      (e) =>
        e.startsWith(`${projectErrorPrefix}jobs.${col.id} `) ||
        (e.startsWith(`${projectErrorPrefix}jobUrl `) && idx === 0),
    );
    const isPrimary = project.jobUrl === cellUrl && cellUrl.length > 0;

    return React.createElement(
      'td',
      { key: col.id, className: 'p-2.5 align-top' },
      React.createElement(ProjectJobCell, {
        projectId: project.id,
        projectName: project.name || project.id,
        columnId: col.id,
        columnName: col.name,
        url: cellUrl,
        error: cellError,
        disabled,
        isPrimary,
        onChange: (url: string) => onUpdateCell(col.id, url),
      }),
    );
  });

  const selectionCell = React.createElement(
    'td',
    { className: 'p-2.5 align-top min-w-48' },
    React.createElement(ProjectJobSelection, {
      projectId: project.id,
      projectName: project.name || project.id,
      columns,
      jobs: project.jobs ?? {},
      selectedColumnIds: project.selectedJobColumns ?? [],
      disabled,
      onToggleColumn: onToggleSelection,
      onSetSelections,
    }),
  );

  const rowActionButtons: React.ReactNode[] = [
    React.createElement(
      'button',
      {
        key: 'settings',
        type: 'button',
        id: `btn-project-settings-${project.id}`,
        onClick: onOpenSettings,
        disabled,
        title: 'Edit advanced settings',
        'aria-label': `Edit settings for ${project.name || project.id}`,
        className: 'p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded focus:outline-none focus:ring-1 focus:ring-slate-400',
      },
      React.createElement(Settings, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
    ),
    React.createElement(
      'button',
      {
        key: 'clone',
        type: 'button',
        id: `btn-clone-project-${project.id}`,
        onClick: onClone,
        disabled,
        title: 'Clone project',
        'aria-label': `Clone project ${project.name || project.id}`,
        className: 'p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded focus:outline-none focus:ring-1 focus:ring-sky-400',
      },
      React.createElement(Copy, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
    ),
  ];

  if (canRemove) {
    rowActionButtons.push(
      React.createElement(
        'button',
        {
          key: 'remove',
          type: 'button',
          id: `btn-remove-project-${project.id}`,
          onClick: onRemove,
          disabled,
          title: 'Remove project',
          'aria-label': `Remove project ${project.name || project.id}`,
          className: 'p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded focus:outline-none focus:ring-1 focus:ring-red-400',
        },
        React.createElement(Trash2, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      ),
    );
  }

  const actionsCell = React.createElement(
    'td',
    { className: 'p-2.5 align-top text-right whitespace-nowrap w-24' },
    React.createElement('div', { className: 'flex items-center justify-end gap-1' }, ...rowActionButtons),
  );

  const cells: React.ReactNode[] = [enabledCell];
  if (!isIdColumnHidden) cells.push(idCell);
  cells.push(nameCell, ...jobCells, selectionCell, actionsCell);

  return React.createElement(
    'tr',
    {
      'data-project-id': project.id,
      className: `border-b border-slate-200 transition-colors ${isEnabled ? 'hover:bg-slate-50/70' : 'bg-slate-50/40 opacity-75'
        }`,
    },
    ...cells,
  );
}
