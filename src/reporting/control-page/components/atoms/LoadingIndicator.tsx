import React, { forwardRef } from 'react';
import type { LoadingIndicatorProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const LoadingIndicator = forwardRef<HTMLDivElement, LoadingIndicatorProps>(
  function LoadingIndicator(
    { visible = true, id, message = 'Loading...', className, ...rest },
    ref,
  ) {
    return React.createElement(
      'div',
      {
        ref,
        id,
        'aria-live': 'polite',
        className: cn('credentials-loading', !visible && 'hidden', className),
        ...rest,
      },
      message,
    );
  },
);

LoadingIndicator.displayName = 'LoadingIndicator';
