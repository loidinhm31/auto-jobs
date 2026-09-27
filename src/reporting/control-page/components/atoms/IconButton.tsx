import React, { forwardRef } from 'react';
import type { IconButtonProps } from '../../types/component-contracts.js';
import { Button } from './Button.js';
import { cn } from '../../utils/cn.js';

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    ariaLabel,
    title,
    tooltip,
    variant = 'ghost',
    size = 'default',
    loading = false,
    disabled = false,
    className,
    children,
    'aria-label': explicitAriaLabel,
    ...rest
  },
  ref,
) {
  const effectiveAriaLabel = explicitAriaLabel ?? ariaLabel ?? title ?? tooltip ?? 'Action';
  const effectiveTitle = title ?? tooltip ?? effectiveAriaLabel;
  const content = loading
    ? React.createElement('span', {
        className:
          'inline-block animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full',
        'aria-hidden': true,
      })
    : (icon ?? children);

  return React.createElement(
    Button,
    {
      ref,
      variant,
      size,
      disabled: disabled || loading,
      'aria-busy': loading ? 'true' : undefined,
      'aria-label': effectiveAriaLabel,
      title: effectiveTitle,
      className: cn('btn-icon', className),
      ...rest,
    },
    content,
  );
});

IconButton.displayName = 'IconButton';
