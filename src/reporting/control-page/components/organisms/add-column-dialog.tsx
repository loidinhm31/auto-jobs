import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { JobColumnInput } from '../../types/index.js';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';

export interface AddColumnDialogProps {
  isOpen: boolean;
  existingColumns: readonly JobColumnInput[];
  onClose: () => void;
  onAdd: (column: JobColumnInput) => void;
}

const COLUMN_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,15}$/;

export function AddColumnDialog({
  isOpen,
  existingColumns,
  onClose,
  onAdd,
}: AddColumnDialogProps) {
  const [colId, setColId] = useState('');
  const [colName, setColName] = useState('');
  const [idError, setIdError] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const existingIds = new Set(existingColumns.map((c) => c.id));
      let candidate = 'job-2';
      for (let i = 2; existingIds.has(candidate); i++) candidate = `job-${i}`;
      setColId(candidate);
      setColName(`Job ${existingColumns.length + 1}`);
      setIdError('');
      setNameError('');
    }
  }, [isOpen, existingColumns]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedId = colId.trim().toLowerCase();
    const trimmedName = colName.trim();
    let valid = true;

    if (!COLUMN_ID_REGEX.test(trimmedId)) {
      setIdError('ID must be 1-16 chars, lowercase alphanumeric or hyphens.');
      valid = false;
    } else if (existingColumns.some((c) => c.id === trimmedId)) {
      setIdError(`Column ID '${trimmedId}' already exists.`);
      valid = false;
    } else {
      setIdError('');
    }

    if (!trimmedName || trimmedName.length > 200) {
      setNameError('Name must be between 1 and 200 characters.');
      valid = false;
    } else {
      setNameError('');
    }

    if (!valid) return;
    onAdd({ id: trimmedId, name: trimmedName });
    onClose();
  };

  const titleElement = React.createElement(
    Dialog.Title,
    { id: 'dialog-add-col-title', className: 'text-base font-semibold text-slate-900 mb-1' },
    'Add Job Column',
  );

  const descElement = React.createElement(
    Dialog.Description,
    { className: 'text-xs text-slate-500 mb-4' },
    'Add a new named Jenkins job link column to the matrix.',
  );

  const inputId = React.createElement(Input, {
    id: 'input-new-col-id',
    label: 'Column ID (max 16 chars)',
    value: colId,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setColId(e.target.value);
      if (idError) setIdError('');
    },
    maxLength: 16,
    error: idError,
    placeholder: 'e.g. build-job',
    autoFocus: true,
  });

  const inputName = React.createElement(Input, {
    id: 'input-new-col-name',
    label: 'Column Name (max 200 chars)',
    value: colName,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setColName(e.target.value);
      if (nameError) setNameError('');
    },
    maxLength: 200,
    error: nameError,
    placeholder: 'e.g. Build & Package',
  });

  const actions = React.createElement(
    'div',
    { className: 'flex justify-end gap-2 mt-4 pt-2 border-t' },
    React.createElement(Button, { type: 'button', variant: 'secondary', onClick: onClose, id: 'btn-cancel-add-col' }, 'Cancel'),
    React.createElement(Button, { type: 'submit', variant: 'primary', id: 'btn-submit-add-col' }, 'Add Column'),
  );

  const formElement = React.createElement(
    'form',
    { onSubmit: handleSubmit, className: 'flex flex-col gap-3' },
    inputId,
    inputName,
    actions,
  );

  const content = React.createElement(
    Dialog.Content,
    {
      id: 'dialog-add-column',
      'aria-labelledby': 'dialog-add-col-title',
      className:
        'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[440px] w-[90vw] focus:outline-none',
    },
    titleElement,
    descElement,
    formElement,
  );

  return React.createElement(
    Dialog.Root,
    { open: isOpen, onOpenChange: (open) => { if (!open) onClose(); } },
    React.createElement(
      Dialog.Portal,
      null,
      React.createElement(Dialog.Overlay, { className: 'fixed inset-0 bg-black/50 z-50 transition-opacity' }),
      content,
    ),
  );
}
