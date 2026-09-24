import React from 'react';
import { Button } from '../atoms/Button.js';
import { Select } from '../atoms/Select.js';
import type { SelectOption } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export interface ExecutionSectionProps {
  isDirty?: boolean;
  isLoading?: boolean;
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
  onRunReports,
  onRunAutoBuild,
  reportWorkers = 1,
  hasDocument = true,
  onReportWorkersChange,
  className,
}: ExecutionSectionProps) {
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
      disabled: isDirty || isLoading || !hasDocument,
      onClick: onRunReports,
    },
    'Generate Reports (All Enabled)',
  );

  const runAutoBuildButton = React.createElement(
    Button,
    {
      type: 'button',
      id: 'btn-run-auto-build',
      variant: 'danger',
      disabled: isDirty || isLoading || !hasDocument || !onRunAutoBuild,
      onClick: onRunAutoBuild,
    },
    'Trigger Auto Build (All Enabled)',
  );

  const selectWorkers = React.createElement(Select, {
    id: 'select-workers',
    label: 'Workers',
    options: REPORT_WORKER_OPTIONS,
    value: String(reportWorkers ?? 1),
    disabled: !hasDocument || isLoading,
    onChange: handleWorkersChange,
  });

  const selectContainer = React.createElement(
    'div',
    { className: 'w-36' },
    selectWorkers,
  );

  return React.createElement(
    'div',
    { className: cn('actions-bar flex flex-wrap gap-4 items-end', className) },
    runReportsButton,
    runAutoBuildButton,
    selectContainer,
  );
}
