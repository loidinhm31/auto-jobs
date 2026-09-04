import React, { forwardRef } from 'react';
import { Badge } from '../atoms/Badge.js';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';
import { Select } from '../atoms/Select.js';
import type {
  BrowserSettingKey,
  BrowserSettingRowProps,
} from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

const settingMetaMap: Record<
  BrowserSettingKey,
  { badgeId: string; clearBtnId: string; controlId: string }
> = {
  PLAYWRIGHT_HEADLESS: {
    badgeId: 'badge-browser-headless',
    clearBtnId: 'btn-clear-browser-headless',
    controlId: 'browser-headless-select',
  },
  PLAYWRIGHT_EXECUTABLE_PATH: {
    badgeId: 'badge-browser-executable-path',
    clearBtnId: 'btn-clear-browser-executable-path',
    controlId: 'browser-executable-path-input',
  },
};

export const BrowserSettingRow = forwardRef<HTMLDivElement, BrowserSettingRowProps>(
  function BrowserSettingRow(
    {
      settingKey,
      setting,
      isConfigured: explicitIsConfigured,
      onClear,
      children,
      className,
      value,
      onChange,
      ...rest
    },
    ref,
  ) {
    const key = (settingKey ?? setting?.key ?? 'PLAYWRIGHT_HEADLESS') as BrowserSettingKey;
    const isConfigured = explicitIsConfigured ?? setting?.isConfigured ?? false;
    const meta = settingMetaMap[key] || {
      badgeId: `badge-browser-${key.toLowerCase().replace(/_/g, '-')}`,
      clearBtnId: `btn-clear-browser-${key.toLowerCase().replace(/_/g, '-')}`,
      controlId: `browser-${key.toLowerCase().replace(/_/g, '-')}-input`,
    };

    const handleClear = () => {
      if (onClear) {
        onClear(key);
      }
    };

    const defaultControl =
      key === 'PLAYWRIGHT_HEADLESS'
        ? React.createElement(
            Select,
            {
              id: meta.controlId,
              name: key,
              className: 'credential-input',
              value: value ?? '',
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                if (onChange) onChange(e.target.value);
              },
              options: [
                { value: '', label: '(Inherit / Unset)' },
                { value: 'true', label: 'Headless (true)' },
                { value: 'false', label: 'Headed (false)' },
              ],
            },
          )
        : React.createElement(Input, {
            id: meta.controlId,
            name: key,
            type: 'text',
            className: 'credential-input',
            placeholder: 'e.g. C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            spellCheck: false,
            value: value ?? '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              if (onChange) onChange(e.target.value);
            },
          });

    const fieldElement = React.createElement(
      'div',
      { className: 'credential-field' },
      React.createElement('label', { htmlFor: meta.controlId }, key),
      React.createElement(
        'div',
        { className: 'credential-badges' },
        React.createElement(
          Badge,
          {
            id: meta.badgeId,
            variant: isConfigured ? 'configured' : 'not-set',
          },
          isConfigured ? 'Configured' : 'Not Set',
        ),
      ),
    );

    const inputGroupElement = React.createElement(
      'div',
      { className: 'credential-input-group' },
      children ?? defaultControl,
      React.createElement(
        Button,
        {
          type: 'button',
          id: meta.clearBtnId,
          variant: 'secondary',
          size: 'sm',
          className: cn('btn-clear-credential', !isConfigured && 'hidden'),
          'data-key': key,
          'aria-label': `Clear ${key}`,
          onClick: handleClear,
        },
        'Clear',
      ),
    );

    return React.createElement(
      'div',
      {
        ref,
        className: cn('credential-row', className),
        ...rest,
      },
      fieldElement,
      inputGroupElement,
    );
  },
);

BrowserSettingRow.displayName = 'BrowserSettingRow';
