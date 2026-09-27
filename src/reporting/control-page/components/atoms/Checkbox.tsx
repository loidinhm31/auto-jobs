import React, { forwardRef } from 'react';
import type { CheckboxProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    id,
    label,
    ariaLabel,
    checked,
    defaultChecked,
    onCheckedChange,
    onChange,
    disabled = false,
    className,
    'aria-label': explicitAriaLabel,
    ...rest
  },
  ref,
) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onCheckedChange?.(e.target.checked);
  };

  const effectiveAriaLabel = explicitAriaLabel ?? ariaLabel ?? (label ? undefined : id);

  const inputElement = React.createElement('input', {
    ref,
    type: 'checkbox',
    id,
    checked,
    defaultChecked,
    disabled,
    onChange: handleChange,
    'aria-label': effectiveAriaLabel,
    className: cn(
      'h-4 w-4 rounded-sm border-slate-300 text-sky-600 accent-sky-600',
      'focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:outline-none',
      'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
      className,
    ),
    ...rest,
  });

  if (!label) {
    return inputElement;
  }

  return React.createElement(
    'div',
    { className: 'inline-flex items-center gap-1.5' },
    inputElement,
    React.createElement(
      'label',
      {
        htmlFor: id,
        className: cn(
          'text-xs font-medium text-slate-700 select-none cursor-pointer',
          disabled && 'cursor-not-allowed opacity-50',
        ),
      },
      label,
    ),
  );
});

Checkbox.displayName = 'Checkbox';
