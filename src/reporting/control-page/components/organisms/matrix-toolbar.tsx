import React from 'react';
import { Plus, Sliders, Columns } from 'lucide-react';
import { Button } from '../atoms/Button.js';

export interface MatrixToolbarProps {
  projectCount: number;
  columnCount: number;
  disabled?: boolean;
  isAtProjectCapacity?: boolean;
  isAtColumnCapacity?: boolean;
  onAddProject: () => void;
  onOpenAddColumn: () => void;
  onOpenDefaults: () => void;
}

export function MatrixToolbar({
  projectCount,
  columnCount,
  disabled = false,
  isAtProjectCapacity = false,
  isAtColumnCapacity = false,
  onAddProject,
  onOpenAddColumn,
  onOpenDefaults,
}: MatrixToolbarProps) {
  const addProjectBtn = React.createElement(
    Button,
    {
      type: 'button',
      id: 'btn-add-project',
      variant: 'primary',
      size: 'sm',
      disabled: disabled || isAtProjectCapacity,
      onClick: onAddProject,
      title: isAtProjectCapacity ? 'Max 50 projects reached' : 'Add new project',
      className: 'inline-flex items-center gap-1.5',
    },
    React.createElement(Plus, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
    React.createElement('span', null, 'Add Project'),
  );

  const addColumnBtn = React.createElement(
    Button,
    {
      type: 'button',
      id: 'btn-add-column',
      variant: 'secondary',
      size: 'sm',
      disabled: disabled || isAtColumnCapacity,
      onClick: onOpenAddColumn,
      title: isAtColumnCapacity ? 'Max 50 columns reached' : 'Add new job column',
      className: 'inline-flex items-center gap-1.5',
    },
    React.createElement(Columns, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
    React.createElement('span', null, 'Add Job Column'),
  );

  const defaultsBtn = React.createElement(
    Button,
    {
      type: 'button',
      id: 'btn-open-defaults',
      variant: 'outline',
      size: 'sm',
      disabled,
      onClick: onOpenDefaults,
      title: 'Edit default settings across all projects',
      className: 'inline-flex items-center gap-1.5',
    },
    React.createElement(Sliders, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
    React.createElement('span', null, 'Defaults'),
  );

  const leftGroup = React.createElement(
    'div',
    { className: 'flex flex-wrap items-center gap-2' },
    addProjectBtn,
    addColumnBtn,
    defaultsBtn,
  );

  const projectBadge = React.createElement(
    'span',
    { id: 'badge-project-count', className: 'px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded-full' },
    `${projectCount} ${projectCount === 1 ? 'Project' : 'Projects'}`,
  );

  const columnBadge = React.createElement(
    'span',
    { id: 'badge-column-count', className: 'px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded-full' },
    `${columnCount} ${columnCount === 1 ? 'Column' : 'Columns'}`,
  );

  const rightGroup = React.createElement(
    'div',
    { className: 'flex items-center gap-2 text-xs text-slate-500 font-medium' },
    projectBadge,
    columnBadge,
  );

  return React.createElement(
    'div',
    { className: 'flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border-b border-slate-200' },
    leftGroup,
    rightGroup,
  );
}
