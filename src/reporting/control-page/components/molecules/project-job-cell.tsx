import React from 'react';
import { ExternalLink } from 'lucide-react';

export interface ProjectJobCellProps {
  projectId: string;
  projectName: string;
  columnId: string;
  columnName: string;
  url: string;
  error?: string | undefined;
  disabled?: boolean;
  isPrimary?: boolean;
  onChange: (url: string) => void;
}

function isValidHttpUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ProjectJobCell({
  projectId,
  projectName,
  columnId,
  columnName,
  url,
  error,
  disabled = false,
  isPrimary = false,
  onChange,
}: ProjectJobCellProps) {
  const cellId = `cell-${projectId}-${columnId}`;
  const errorId = `error-${projectId}-${columnId}`;
  const hasError = Boolean(error);
  const isValidUrl = isValidHttpUrl(url);

  const inputClass = `w-full text-xs px-2 py-1 bg-white border rounded font-mono transition-colors focus:outline-none focus:ring-1 ${hasError
    ? 'border-red-400 text-red-900 focus:ring-red-400 focus:border-red-400'
    : 'border-slate-300 text-slate-800 focus:ring-sky-500 focus:border-sky-500'
    } ${isValidUrl ? 'pr-7' : ''} ${disabled ? 'bg-slate-50 text-slate-400' : ''}`;

  const inputElement = React.createElement('input', {
    type: 'url',
    id: cellId,
    value: url,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    disabled,
    placeholder: 'https://...',
    'aria-label': `${projectName} - ${columnName} URL`,
    'aria-invalid': hasError,
    'aria-describedby': hasError ? errorId : undefined,
    className: inputClass,
  });

  const externalLinkElement = isValidUrl
    ? React.createElement(
      'a',
      {
        href: url.trim(),
        target: '_blank',
        rel: 'noopener noreferrer',
        title: `Open ${columnName} URL in new tab`,
        'aria-label': `Open ${columnName} URL for ${projectName} in new tab`,
        className:
          'absolute right-1.5 text-slate-400 hover:text-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-500 p-0.5 rounded',
      },
      React.createElement(ExternalLink, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
    )
    : null;

  const inputWrapper = React.createElement(
    'div',
    { className: 'relative flex items-center' },
    inputElement,
    externalLinkElement,
  );
  let statusElement: React.ReactNode = null;
  if (hasError) {
    statusElement = React.createElement(
      'span',
      { id: errorId, className: 'text-red-600 font-medium truncate', role: 'alert', title: error },
      error,
    );
  } else if (isPrimary) {
    statusElement = React.createElement(
      'span',
      { className: 'text-sky-700 font-medium text-[10px]', title: 'Primary jobUrl mirror for CLI/tools' },
      'Primary URL',
    );
  }

  const footerWrapper = React.createElement(
    'div',
    { className: 'flex items-center justify-between gap-1 text-[11px] leading-tight' },
    statusElement,
  );

  return React.createElement(
    'div',
    { className: 'flex flex-col gap-1 w-full min-w-44' },
    inputWrapper,
    footerWrapper,
  );
}
