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
  return React.createElement(
    'div',
    {
      ref,
      id,
      role: 'status',
      'aria-live': 'polite',
      className: cn('status-banner', variant, !visible && 'hidden', className),
      ...rest,
    },
    message,
  );
});

StatusBanner.displayName = 'StatusBanner';
