import React, { forwardRef } from 'react';
import type { RunResultBoxProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const RunResultBox = forwardRef<HTMLDivElement, RunResultBoxProps>(
  function RunResultBox(
    {
      result,
      visible: explicitVisible,
      id = 'run-result-box',
      className,
      ...rest
    },
    ref,
  ) {
    const hasReportUrl = Boolean(result?.reportUrl);
    const hasBuildPageUrl = Boolean(result?.buildPageUrl);
    const hasError = Boolean(result?.error);
    const hasSummary = Boolean(result && typeof result['summary'] === 'string');

    const isVisible =
      explicitVisible !== undefined
        ? explicitVisible
        : Boolean(result && (hasReportUrl || hasBuildPageUrl || hasError || hasSummary));

    const children: React.ReactNode[] = [];

    if (result?.reportUrl) {
      children.push(
        React.createElement(
          'p',
          { key: 'report-link', className: 'm-0' },
          hasError ? 'Report completed with errors. ' : 'Report generated successfully. ',
          React.createElement(
            'a',
            {
              href: result.reportUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'text-emerald-700 font-semibold underline hover:text-emerald-800',
            },
            'Open Generated Report',
          ),
        ),
      );
    } else if (result?.buildPageUrl) {
      children.push(
        React.createElement(
          'p',
          { key: 'build-link', className: 'm-0' },
          'Auto-build triggered. ',
          React.createElement(
            'a',
            {
              href: result.buildPageUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'text-emerald-700 font-semibold underline hover:text-emerald-800',
            },
            'Open Jenkins Build',
          ),
        ),
      );
    }

    if (result?.error) {
      children.push(
        React.createElement(
          'p',
          { key: 'error', className: 'run-error-msg text-red-600 font-medium m-0 mt-1' },
          `Error: ${result.error}`,
        ),
      );
    } else if (!hasReportUrl && !hasBuildPageUrl && hasSummary) {
      children.push(
        React.createElement(
          'p',
          { key: 'summary', className: 'm-0' },
          result!['summary'] as string,
        ),
      );
    }

    return React.createElement(
      'div',
      {
        ref,
        id,
        className: cn('run-result-box', !isVisible && 'hidden', className),
        ...rest,
      },
      ...children,
    );
  },
);

RunResultBox.displayName = 'RunResultBox';
