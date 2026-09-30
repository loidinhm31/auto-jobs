import React from 'react';
import type { JobColumnInput } from '../../types/index.js';

export interface ProjectJobSelectionProps {
  projectId: string;
  projectName: string;
  columns: readonly JobColumnInput[];
  jobs: Record<string, string>;
  selectedColumnIds: readonly string[];
  disabled?: boolean | undefined;
  onToggleColumn: (columnId: string, selected: boolean) => void;
  onSetSelections?: ((columnIds: readonly string[]) => void) | undefined;
}
export function ProjectJobSelection({
  projectId,
  projectName,
  columns,
  jobs,
  selectedColumnIds,
  disabled = false,
  onToggleColumn,
  onSetSelections,
}: ProjectJobSelectionProps) {
  if (columns.length === 0) {
    return React.createElement('span', { className: 'text-xs text-slate-400 italic' }, 'No columns');
  }

  const allSelected = columns.length > 0 && columns.every((col) => selectedColumnIds.includes(col.id));
  const noneSelected = selectedColumnIds.length === 0;

  const selectAllBtn = React.createElement(
    'button',
    {
      type: 'button',
      id: `btn-select-all-targets-${projectId}`,
      disabled: disabled || allSelected,
      onClick: () => onSetSelections?.(columns.map((c) => c.id)),
      'aria-label': `Select all targets for ${projectName}`,
      className: `text-[10px] font-medium px-1.5 py-0.5 rounded text-sky-700 hover:text-sky-900 hover:bg-sky-50 transition-colors ${disabled || allSelected ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
        }`,
    },
    'All',
  );

  const deselectAllBtn = React.createElement(
    'button',
    {
      type: 'button',
      id: `btn-deselect-all-targets-${projectId}`,
      disabled: disabled || noneSelected,
      onClick: () => onSetSelections?.([]),
      'aria-label': `Deselect all targets for ${projectName}`,
      className: `text-[10px] font-medium px-1.5 py-0.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors ${disabled || noneSelected ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
        }`,
    },
    'None',
  );

  const quickActions = React.createElement(
    'div',
    { className: 'inline-flex items-center gap-0.5 border-r border-slate-200 pr-1.5 mr-0.5' },
    selectAllBtn,
    deselectAllBtn,
  );

  const columnLabels = columns.map((column) => {
    const isSelected = selectedColumnIds.includes(column.id);
    const cellUrl = jobs[column.id]?.trim() ?? '';
    const isEmpty = cellUrl.length === 0;
    const checkboxId = `checkbox-select-${projectId}-${column.id}`;

    const checkbox = React.createElement('input', {
      type: 'checkbox',
      id: checkboxId,
      name: `select-${projectId}-${column.id}`,
      checked: isSelected,
      disabled,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onToggleColumn(column.id, e.target.checked),
      'aria-label': `Select ${column.name} for ${projectName}`,
      className: 'h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 accent-sky-700',
    });

    const nameSpan = React.createElement(
      'span',
      { className: 'truncate max-w-28' },
      column.name,
    );

    const skipHint = isEmpty && isSelected
      ? React.createElement(
        'span',
        {
          id: `skip-hint-${projectId}-${column.id}`,
          className:
            'text-[10px] text-amber-600 font-normal px-1 py-0.2 bg-amber-50 rounded border border-amber-200',
        },
        'empty',
      )
      : null;

    const labelClass = `inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs cursor-pointer border select-none transition-colors ${isSelected
      ? 'bg-sky-50 border-sky-300 text-sky-900 font-medium'
      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;

    const titleText =
      isEmpty && isSelected
        ? `${column.name} is selected but has empty URL and will be skipped at execution`
        : `${column.name} target selection`;

    return React.createElement(
      'label',
      {
        key: column.id,
        htmlFor: checkboxId,
        className: labelClass,
        title: titleText,
      },
      checkbox,
      nameSpan,
      skipHint,
    );
  });

  return React.createElement(
    'div',
    {
      role: 'group',
      'aria-label': `Execution target selection for ${projectName}`,
      className: 'flex flex-wrap items-center gap-2 min-w-44 py-1',
    },
    quickActions,
    ...columnLabels,
  );
}
