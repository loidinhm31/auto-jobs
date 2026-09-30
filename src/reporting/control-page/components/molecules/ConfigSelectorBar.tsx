import { forwardRef } from 'react';
import React from 'react';
import { KeyRound, RotateCcw, Save, Settings } from 'lucide-react';
import { Button } from '../atoms/Button.js';
import { Select } from '../atoms/Select.js';
import type { ConfigSelectorBarProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const ConfigSelectorBar = forwardRef<HTMLDivElement, ConfigSelectorBarProps>(
  function ConfigSelectorBar(
    {
      configs,
      activeConfig,
      onSelectConfig,
      onReload,
      onSave,
      onOpenCredentials,
      onOpenBrowserSettings,
      isDirty = false,
      isSaving = false,
      isLoading = false,
      isInvalid = false,
      className,
      ...rest
    },
    ref,
  ) {
    const normalizedOptions = configs.map((cfg) =>
      typeof cfg === 'string' ? { value: cfg, label: cfg } : cfg,
    );

    const labelElement = React.createElement(
      'label',
      {
        htmlFor: 'config-select',
        className: 'text-sm font-semibold text-slate-700 whitespace-nowrap',
      },
      'Active Configuration:',
    );

    const selectElement = React.createElement(Select, {
      id: 'config-select',
      ariaLabel: 'Select Configuration',
      value: activeConfig,
      disabled: isLoading,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onSelectConfig(e.target.value),
      options: normalizedOptions,
      className: 'min-w-[160px]',
    });

    const reloadBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-reload',
        variant: 'secondary',
        disabled: isLoading,
        onClick: onReload,
        className: 'inline-flex items-center gap-1.5',
      },
      React.createElement(RotateCcw, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      React.createElement('span', null, 'Reload'),
    );

    const saveBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-save',
        disabled: !isDirty || isSaving || isLoading,
        loading: isSaving,
        onClick: onSave,
        className: 'inline-flex items-center gap-1.5',
      },
      React.createElement(Save, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      React.createElement('span', null, 'Save Config'),
    );

    const divider = React.createElement('div', {
      className: 'h-5 w-px bg-slate-300 mx-1 hidden sm:block',
      'aria-hidden': true,
    });

    const credsBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-credentials',
        variant: 'secondary',
        onClick: onOpenCredentials,
        className: 'inline-flex items-center gap-1.5',
      },
      React.createElement(KeyRound, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      React.createElement('span', null, 'Credentials'),
    );

    const browserBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-browser-settings',
        variant: 'secondary',
        onClick: onOpenBrowserSettings,
        className: 'inline-flex items-center gap-1.5',
      },
      React.createElement(Settings, { className: 'w-3.5 h-3.5', 'aria-hidden': true }),
      React.createElement('span', null, 'Browser Settings'),
    );

    return React.createElement(
      'div',
      {
        ref,
        className: cn('config-selector-group flex items-center gap-2 flex-wrap', className),
        ...rest,
      },
      labelElement,
      selectElement,
      reloadBtn,
      saveBtn,
      divider,
      credsBtn,
      browserBtn,
    );
  },
);

ConfigSelectorBar.displayName = 'ConfigSelectorBar';
