import React from 'react';
import { Button } from '../atoms/Button.js';
import { Select } from '../atoms/Select.js';
import type { SelectOption } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export interface ExecutionSectionProps {
  isDirty?: boolean;
  isLoading?: boolean;
  isInvalid?: boolean;
  executableTargetCount?: number;
  skippedBlankCount?: number;
  onRunReports: () => void;
  onRunAutoBuild?: () => void;
  reportWorkers?: number;
  hasDocument?: boolean;
  onReportWorkersChange?: (count: number) => void;
  className?: string;
}

const REPORT_WORKER_OPTIONS: SelectOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

export function ExecutionSection({
  isDirty = false,
  isLoading = false,
  isInvalid = false,
  executableTargetCount,
  skippedBlankCount = 0,
  onRunReports,
  onRunAutoBuild,
  reportWorkers = 1,
  hasDocument = true,
  onReportWorkersChange,
  className,
}: ExecutionSectionProps) {
  const hasNoExecutableTargets = executableTargetCount !== undefined && executableTargetCount === 0;
  const isExecutionDisabled = isDirty || isLoading || !hasDocument || isInvalid || hasNoExecutableTargets;

  const handleWorkersChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCount = Number.parseInt(event.target.value, 10);
    if (!Number.isNaN(nextCount) && onReportWorkersChange) {
      onReportWorkersChange(nextCount);
    }
  };

  const runReportsButton = React.createElement(
    Button,
    {
      type: 'button',
      id: 'btn-run-reports',
      variant: 'primary',
      disabled: isExecutionDisabled,
      onClick: onRunReports,
    },
    'Generate Reports',
  );

  const runAutoBuildButton = onRunAutoBuild
    ? React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-run-auto-build',
        variant: 'danger',
        disabled: isExecutionDisabled,
        onClick: onRunAutoBuild,
      },
      'Trigger Auto Build',
    )
    : null;

  const selectWorkers = React.createElement(Select, {
    id: 'select-workers',
    label: 'Workers',
    options: REPORT_WORKER_OPTIONS,
    value: String(reportWorkers ?? 1),
    disabled: !hasDocument || isLoading,
    onChange: handleWorkersChange,
  });

  const selectContainer = React.createElement('div', { className: 'w-36' }, selectWorkers);

  const buttonsRow = React.createElement(
    'div',
    { className: 'flex flex-wrap gap-4 items-end' },
    runReportsButton,
    runAutoBuildButton,
    selectContainer,
  );

  const feedbackChildren: React.ReactNode[] = [];
  if (executableTargetCount !== undefined && executableTargetCount > 0) {
    feedbackChildren.push(
      React.createElement(
        'span',
        { key: 'target-count', id: 'text-target-count', className: 'text-slate-700' },
        `${executableTargetCount} target${executableTargetCount === 1 ? '' : 's'} selected`,
      ),
    );
  }
  if (skippedBlankCount > 0) {
    feedbackChildren.push(
      React.createElement(
        'span',
        { key: 'skipped-blanks', id: 'text-skipped-blanks', className: 'text-amber-600' },
        `(${skippedBlankCount} empty cell${skippedBlankCount === 1 ? '' : 's'} skipped)`,
      ),
    );
  }
  if (hasNoExecutableTargets && hasDocument) {
    feedbackChildren.push(
      React.createElement(
        'span',
        { key: 'no-targets', id: 'text-no-targets', className: 'text-amber-600' },
        'No executable targets selected.',
      ),
    );
  }

  const feedbackRow = React.createElement(
    'div',
    { className: 'flex items-center gap-2 text-xs text-slate-500 font-medium min-h-5' },
    ...feedbackChildren,
  );

  return React.createElement(
    'div',
    { className: cn('actions-bar flex flex-col gap-2', className) },
    buttonsRow,
    feedbackRow,
  );
}
