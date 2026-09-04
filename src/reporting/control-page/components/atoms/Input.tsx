import React, { forwardRef } from 'react';
import type { InputProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    error,
    type = 'text',
    className,
    spellCheck = false,
    autoComplete = 'off',
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedby,
    ...rest
  },
  ref,
) {
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = ariaDescribedby ?? errorId;

  const inputElement = React.createElement('input', {
    ref,
    id,
    type,
    spellCheck,
    autoComplete,
    'aria-invalid': ariaInvalid ?? Boolean(error),
    'aria-describedby': describedBy,
    className: cn(className),
    ...rest,
  });

  if (!label && !error) {
    return inputElement;
  }

  const children: React.ReactNode[] = [];
  if (label) {
    children.push(
      React.createElement(
        'label',
        {
          key: 'label',
          htmlFor: id,
          className: 'text-xs font-semibold text-slate-800',
        },
        label,
      ),
    );
  }
  children.push(inputElement);
  if (error) {
    children.push(
      React.createElement(
        'span',
        {
          key: 'error',
          id: errorId,
          className: 'text-xs text-red-600 font-medium',
          role: 'alert',
        },
        error,
      ),
    );
  }

  return React.createElement(
    'div',
    { className: 'flex flex-col gap-1 w-full' },
    ...children,
  );
});

Input.displayName = 'Input';
