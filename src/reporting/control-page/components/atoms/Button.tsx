import React, { forwardRef } from 'react';
import type { ButtonProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'default',
    disabled = false,
    loading = false,
    type = 'button',
    id,
    className,
    children,
    ...rest
  },
  ref,
) {
  const content = loading
    ? [
        React.createElement('span', {
          key: 'spinner',
          className:
            'inline-block animate-spin mr-1.5 h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full',
          'aria-hidden': true,
        }),
        children,
      ]
    : children;

  return React.createElement(
    'button',
    {
      ref,
      id,
      type,
      disabled: disabled || loading,
      className: cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className),
      ...rest,
    },
    content,
  );
});

Button.displayName = 'Button';
