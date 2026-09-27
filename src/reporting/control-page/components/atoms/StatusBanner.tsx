import React, { forwardRef } from 'react';
import type { StatusBannerProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const StatusBanner = forwardRef<HTMLDivElement, StatusBannerProps>(function StatusBanner(
  {
    id = 'status-banner',
    variant = 'info',
    message,
    visible = Boolean(message),
    className,
    ...rest
  },
  ref,
) {
  const isError = variant === 'error';
  const role = isError ? 'alert' : 'status';
  const ariaLive = isError ? 'assertive' : 'polite';

  return React.createElement(
    'div',
    {
      ref,
      id,
      role,
      'aria-live': ariaLive,
      className: cn('status-banner', variant, !visible && 'hidden', className),
      ...rest,
    },
    message,
  );
});

StatusBanner.displayName = 'StatusBanner';
