import React, { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import type { JobColumnInput } from '../../types/index.js';

export interface JobColumnHeaderProps {
  column: JobColumnInput;
  columnIndex: number;
  totalColumns: number;
  disabled?: boolean;
  affectedRowCount?: number;
  onRename: (columnId: string, newName: string) => void;
  onRemove: (columnId: string) => void;
}

export function JobColumnHeader({
  column,
  columnIndex: _columnIndex,
  totalColumns,
  disabled = false,
  affectedRowCount = 0,
  onRename,
  onRemove,
}: JobColumnHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const handleStartRename = () => {
    if (disabled) return;
    setNameDraft(column.name);
    setIsEditing(true);
    setIsConfirmingRemove(false);
  };
  const handleSaveRename = () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length > 0 && trimmed.length <= 200) {
      onRename(column.id, trimmed);
      setIsEditing(false);
    }
  };
  const handleCancelRename = () => { setNameDraft(column.name); setIsEditing(false); };
  const handleKeyDownRename = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveRename(); }
    else if (e.key === 'Escape') { e.preventDefault(); handleCancelRename(); }
  };
  const handleStartRemove = () => {
    if (disabled || totalColumns <= 1) return;
    setIsConfirmingRemove(true);
    setIsEditing(false);
  };
  if (isConfirmingRemove) {
    return React.createElement(
      'div',
      {
        className: 'flex flex-col gap-1 p-1 bg-red-50 border border-red-200 rounded text-xs',
        role: 'alertdialog',
        'aria-labelledby': `remove-confirm-title-${column.id}`,
        'aria-describedby': `remove-confirm-desc-${column.id}`,
      },
      React.createElement(
        'span',
        { id: `remove-confirm-title-${column.id}`, className: 'font-semibold text-red-800' },
        `Remove '${column.name}'?`,
      ),
      affectedRowCount > 0
        ? React.createElement(
          'span',
          { id: `remove-confirm-desc-${column.id}`, className: 'text-red-700' },
          `${affectedRowCount} row(s) have URLs in this column.`,
        )
        : null,
      React.createElement(
        'div',
        { className: 'flex items-center gap-1 mt-1' },
        React.createElement(
          'button',
          {
            type: 'button',
            id: `btn-confirm-remove-col-${column.id}`,
            onClick: () => {
              onRemove(column.id);
              setIsConfirmingRemove(false);
            },
            className:
              'px-2 py-0.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 focus:outline-none focus:ring-1 focus:ring-red-500',
          },
          'Confirm',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            id: `btn-cancel-remove-col-${column.id}`,
            onClick: () => setIsConfirmingRemove(false),
            className:
              'px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs hover:bg-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400',
          },
          'Cancel',
        ),
      ),
    );
  }

  if (isEditing) {
    return React.createElement(
      'div',
      { className: 'flex items-center gap-1 min-w-36' },
      React.createElement('input', {
        type: 'text',
        id: `input-rename-col-${column.id}`,
        value: nameDraft,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNameDraft(e.target.value),
        onKeyDown: handleKeyDownRename,
        maxLength: 200,
        autoFocus: true,
        className:
          'w-full px-1.5 py-0.5 text-xs bg-white text-slate-900 border border-sky-500 rounded focus:outline-none focus:ring-1 focus:ring-sky-500',
        'aria-label': `New name for column ${column.name}`,
      }),
      React.createElement(
        'button',
        {
          type: 'button',
          id: `btn-save-rename-col-${column.id}`,
          onClick: handleSaveRename,
          disabled: !nameDraft.trim(),
          title: 'Save column name',
          'aria-label': 'Save column name',
          className: 'p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-40',
        },
        React.createElement(Check, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          id: `btn-cancel-rename-col-${column.id}`,
          onClick: handleCancelRename,
          title: 'Cancel rename',
          'aria-label': 'Cancel rename',
          className: 'p-1 text-slate-500 hover:text-slate-700',
        },
        React.createElement(X, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      ),
    );
  }

  const actionButtons: React.ReactNode[] = [
    React.createElement(
      'button',
      {
        key: 'rename',
        type: 'button',
        id: `btn-rename-col-${column.id}`,
        onClick: handleStartRename,
        disabled,
        title: `Rename ${column.name}`,
        'aria-label': `Rename ${column.name}`,
        className:
          'p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-slate-400',
      },
      React.createElement(Pencil, { className: 'w-3 h-3', 'aria-hidden': true }),
    ),
  ];

  if (totalColumns > 1) {
    actionButtons.push(
      React.createElement(
        'button',
        {
          key: 'remove',
          type: 'button',
          id: `btn-remove-col-${column.id}`,
          onClick: handleStartRemove,
          disabled,
          title: `Remove ${column.name}`,
          'aria-label': `Remove ${column.name}`,
          className:
            'p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-red-400',
        },
        React.createElement(Trash2, { className: 'w-3 h-3', 'aria-hidden': true }),
      ),
    );
  }

  return React.createElement(
    'div',
    { className: 'flex items-center justify-between gap-1 group/header min-w-32' },
    React.createElement(
      'span',
      {
        id: `col-name-${column.id}`,
        className: 'text-xs font-semibold text-slate-700 truncate',
        title: column.name,
      },
      column.name,
    ),
    React.createElement('div', { className: 'flex items-center gap-0.5 shrink-0' }, ...actionButtons),
  );
}
