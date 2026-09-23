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
    } else if (result?.buildPageUrl || result?.buildResult) {
      const buildNumberText = result?.buildNumber ? `${result.buildNumber} ` : '';
      const statusPrefix =
        result?.buildResult === 'SUCCESS'
          ? 'Auto-build completed successfully. '
          : result?.buildResult && result.buildResult !== 'SUCCESS'
          ? 'Auto-build finished with issues. '
          : 'Auto-build triggered. ';

      children.push(
        React.createElement(
          'p',
          { key: 'build-link', className: 'm-0 flex flex-wrap items-center gap-1.5' },
          statusPrefix,
          buildNumberText
            ? React.createElement('span', { key: 'b-num', className: 'font-semibold' }, `Build ${buildNumberText}`)
            : null,
          result?.buildResult
            ? React.createElement(
                'span',
                {
                  key: 'b-res',
                  className: cn(
                    'px-2 py-0.5 rounded text-xs font-semibold',
                    result.buildResult === 'SUCCESS'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800',
                  ),
                },
                result.buildResult,
              )
            : null,
          React.createElement(
            'a',
            {
              href: result?.buildPageUrl ?? result?.jobUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'text-emerald-700 font-semibold underline hover:text-emerald-800',
            },
            'Open Jenkins Build',
          ),
        ),
      );

      if (Array.isArray(result?.stages) && result.stages.length > 0) {
        children.push(
          React.createElement(
            'div',
            { key: 'stages-breakdown', className: 'mt-2 flex flex-wrap gap-1 text-xs text-slate-600' },
            result.stages.map((st) =>
              React.createElement(
                'span',
                {
                  key: `st-${st.index}`,
                  className: cn(
                    'px-1.5 py-0.5 rounded border',
                    st.status === 'SUCCESS'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : st.status === 'FAILED'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-slate-100 text-slate-600',
                  ),
                },
                `${st.name}: ${st.status}${st.duration ? ` (${st.duration})` : ''}`,
              ),
            ),
          ),
        );
      }
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
