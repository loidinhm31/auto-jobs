import React, { forwardRef } from 'react';
import type { FormFieldProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  function FormField(
    {
      id,
      label,
      required = false,
      helperText,
      error,
      className,
      labelClassName,
      orientation = 'vertical',
      children,
    },
    ref,
  ) {
    const childrenNodes: React.ReactNode[] = [];

    if (label) {
      const labelChildren: React.ReactNode[] = [label];
      if (required) {
        labelChildren.push(
          React.createElement(
            'span',
            { key: 'asterisk', className: 'text-red-600 font-bold ml-0.5', 'aria-hidden': true },
            '*',
          ),
          React.createElement('span', { key: 'sr-required', className: 'sr-only' }, ' (required)'),
        );
      }
      childrenNodes.push(
        React.createElement(
          'label',
          {
            key: 'label',
            htmlFor: id,
            className: cn(
              'text-sm font-semibold text-slate-700 flex items-center gap-1 select-none',
              labelClassName,
            ),
          },
          ...labelChildren,
        ),
      );
    }

    childrenNodes.push(children);

    if (error) {
      childrenNodes.push(
        React.createElement(
          'p',
          {
            key: 'error',
            id: `${id}-error`,
            role: 'alert',
            className: 'text-xs font-medium text-red-600 m-0 flex items-center gap-1',
          },
          error,
        ),
      );
    } else if (helperText) {
      childrenNodes.push(
        React.createElement(
          'p',
          {
            key: 'helper',
            id: `${id}-helper`,
            className: 'text-xs text-slate-500 m-0',
          },
          helperText,
        ),
      );
    }

    return React.createElement(
      'div',
      {
        ref,
        className: cn(
          'form-field flex flex-col gap-1.5',
          orientation === 'horizontal' && 'sm:flex-row sm:items-center sm:gap-4',
          className,
        ),
      },
      ...childrenNodes,
    );
  },
);

FormField.displayName = 'FormField';
