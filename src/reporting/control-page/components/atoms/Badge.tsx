import React, { forwardRef } from 'react';
import type { BadgeProps, BadgeVariant } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

const variantClassMap: Record<BadgeVariant, string> = {
  idle: 'badge-idle',
  queued: 'badge-queued',
  running: 'badge-running',
  succeeded: 'badge-succeeded',
  failed: 'badge-failed',
  unknown: 'badge-unknown',
  'submission-unknown': 'badge-unknown',
  configured: 'badge-configured',
  missing: 'badge-missing',
  'not-set': 'badge-missing', // Browser settings use 'badge-missing' class with 'Not Set' text
};

const defaultLabelMap: Record<BadgeVariant, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  unknown: 'Unknown',
  'submission-unknown': 'Unknown',
  configured: 'Configured',
  missing: 'Missing',
  'not-set': 'Not Set',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant, id, className, children, ...rest },
  ref,
) {
  const variantClass = variantClassMap[variant] || `badge-${variant}`;
  const content = children ?? defaultLabelMap[variant] ?? variant;

  return React.createElement(
    'span',
    {
      ref,
      id,
      className: cn('badge', variantClass, className),
      ...rest,
    },
    content,
  );
});

Badge.displayName = 'Badge';
