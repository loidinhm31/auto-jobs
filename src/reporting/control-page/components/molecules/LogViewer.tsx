import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { LogViewerProps } from '../../types/component-contracts.js';
import type { RunLogEntry } from '../../types/index.js';
import { cn } from '../../utils/cn.js';

function formatLogContent(logs: RunLogEntry[] | string): string {
  if (typeof logs === 'string') {
    return logs.length > 0 ? logs : 'No active run.';
  }

  if (!Array.isArray(logs) || logs.length === 0) {
    return 'No active run.';
  }

  return logs
    .map((entry) => {
      const time = entry.timestamp ? `[${entry.timestamp}] ` : '';
      return `${time}${entry.message}`;
    })
    .join('\n');
}

export const LogViewer = forwardRef<HTMLPreElement, LogViewerProps>(function LogViewer(
  { logs, id = 'run-logs', className, ...rest },
  ref,
) {
  const localRef = useRef<HTMLPreElement>(null);
  useImperativeHandle(ref, () => localRef.current!);

  const content = formatLogContent(logs);

  useEffect(() => {
    if (localRef.current) {
      localRef.current.scrollTop = localRef.current.scrollHeight;
    }
  }, [content]);

  return React.createElement(
    'pre',
    {
      ref: localRef,
      id,
      role: 'log',
      'aria-live': 'polite',
      className: cn('log-pre', className),
      ...rest,
    },
    content,
  );
});

LogViewer.displayName = 'LogViewer';
