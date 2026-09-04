import React, { forwardRef } from 'react';
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
        className: 'text-sm font-semibold text-slate-700',
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
    });

    const reloadBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-reload',
        variant: 'secondary',
        disabled: isLoading,
        onClick: onReload,
      },
      'Reload',
    );

    const saveBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-save',
        variant: 'primary',
        disabled: !isDirty || isSaving || isLoading,
        loading: isSaving,
        onClick: onSave,
      },
      'Save Config',
    );

    const credsBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-credentials',
        variant: 'secondary',
        disabled: isLoading,
        onClick: onOpenCredentials,
      },
      'Credentials',
    );

    const browserBtn = React.createElement(
      Button,
      {
        type: 'button',
        id: 'btn-browser-settings',
        variant: 'secondary',
        disabled: isLoading,
        onClick: onOpenBrowserSettings,
      },
      'Browser Settings',
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
      credsBtn,
      browserBtn,
    );
  },
);

ConfigSelectorBar.displayName = 'ConfigSelectorBar';
