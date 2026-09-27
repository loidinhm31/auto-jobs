import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);
  useImperativeHandle(ref, () => localRef.current!);

  const content = formatLogContent(logs);

  useEffect(() => {
    if (localRef.current) {
      localRef.current.scrollTop = localRef.current.scrollHeight;
    }
  }, [content]);

  const handleCopy = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback or ignore
      }
    }
  }, [content]);

  const headerLeft = React.createElement(
    'div',
    { className: 'flex items-center gap-2' },
    React.createElement(Terminal, {
      className: 'w-3.5 h-3.5 text-slate-400',
      'aria-hidden': true,
    }),
    React.createElement(
      'span',
      { className: 'font-mono text-xs font-semibold text-slate-300' },
      'Console Output',
    ),
  );

  const copyButton = React.createElement(
    'button',
    {
      type: 'button',
      onClick: handleCopy,
      'aria-label': copied ? 'Copied logs to clipboard' : 'Copy logs to clipboard',
      className:
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500',
    },
    React.createElement(copied ? Check : Copy, {
      className: 'w-3 h-3',
      'aria-hidden': true,
    }),
    React.createElement('span', null, copied ? 'Copied' : 'Copy'),
  );

  const headerBar = React.createElement(
    'div',
    {
      className:
        'log-viewer-header flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 rounded-t-md',
    },
    headerLeft,
    copyButton,
  );

  const preElement = React.createElement(
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

  return React.createElement(
    'div',
    {
      className:
        'log-viewer-container flex flex-col rounded-md overflow-hidden border border-slate-800 shadow-sm bg-slate-950',
    },
    headerBar,
    preElement,
  );
});

LogViewer.displayName = 'LogViewer';
