import React, { forwardRef } from 'react';
import type { SelectProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    options,
    label,
    ariaLabel,
    className,
    children,
    'aria-label': explicitAriaLabel,
    ...rest
  },
  ref,
) {
  const effectiveAriaLabel = explicitAriaLabel ?? ariaLabel ?? (label ? undefined : id);

  const optionElements = options
    ? options.map((opt) =>
        React.createElement('option', { key: opt.value, value: opt.value }, opt.label),
      )
    : children;

  const selectElement = React.createElement(
    'select',
    {
      ref,
      id,
      'aria-label': effectiveAriaLabel,
      className: cn(
        'bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600',
        className,
      ),
      ...rest,
    },
    optionElements,
  );

  if (!label) {
    return selectElement;
  }

  return React.createElement(
    'div',
    { className: 'flex flex-col gap-1' },
    React.createElement(
      'label',
      { htmlFor: id, className: 'text-xs font-semibold text-slate-800' },
      label,
    ),
    selectElement,
  );
});

Select.displayName = 'Select';
