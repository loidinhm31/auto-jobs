import React, { useEffect, useRef } from 'react';

export interface MatrixEnabledHeaderProps {
  allEnabled: boolean;
  isIndeterminate: boolean;
  disabled?: boolean;
  onToggleAll: () => void;
}

export function MatrixEnabledHeader({
  allEnabled,
  isIndeterminate,
  disabled = false,
  onToggleAll,
}: MatrixEnabledHeaderProps) {
  const checkboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  return React.createElement(
    'th',
    { scope: 'col', className: 'p-2.5 text-center w-10' },
    React.createElement(
      'div',
      { className: 'flex items-center justify-center' },
      React.createElement('input', {
        ref: checkboxRef,
        type: 'checkbox',
        id: 'checkbox-enabled-all',
        checked: allEnabled,
        disabled,
        'aria-label': 'Enable all projects',
        title: allEnabled ? 'Disable all projects' : 'Enable all projects',
        onChange: onToggleAll,
        className: 'h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 accent-sky-700 cursor-pointer',
      }),
    ),
  );
}
