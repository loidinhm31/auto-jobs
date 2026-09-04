import React from 'react';
import { Button } from '../atoms/Button.js';
import { cn } from '../../utils/cn.js';

export interface ExecutionSectionProps {
  isDirty?: boolean;
  isLoading?: boolean;
  onRunReports: () => void;
  className?: string;
}

export function ExecutionSection({
  isDirty = false,
  isLoading = false,
  onRunReports,
  className,
}: ExecutionSectionProps) {
  return (
    <div className={cn('actions-bar flex gap-4 items-center', className)}>
      <Button
        type="button"
        id="btn-run-reports"
        variant="primary"
        disabled={isDirty || isLoading}
        onClick={onRunReports}
      >
        Generate Reports (All Enabled)
      </Button>
    </div>
  );
}
