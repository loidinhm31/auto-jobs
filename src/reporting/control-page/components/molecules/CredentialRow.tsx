import React, { forwardRef } from 'react';
import { Badge } from '../atoms/Badge.js';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';
import type { CredentialRowProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const CredentialRow = forwardRef<HTMLDivElement, CredentialRowProps>(
  function CredentialRow(
    {
      secretKey,
      credential,
      isConfigured: explicitIsConfigured,
      value,
      onChange,
      onClear,
      className,
      inputRef,
      ...rest
    },
    ref,
  ) {
    const key = secretKey ?? credential?.key ?? '';
    const isConfigured = explicitIsConfigured ?? credential?.isConfigured ?? false;
    const inputId = `secret-input-${key}`;

    const handleClear = () => {
      if (onClear && key) {
        onClear(key);
      }
    };

    const fieldElement = React.createElement(
      'div',
      { className: 'credential-field' },
      React.createElement('label', { htmlFor: inputId }, key),
      React.createElement(
        Badge,
        { variant: isConfigured ? 'configured' : 'missing' },
        isConfigured ? 'Configured' : 'Missing',
      ),
    );

    const inputGroupChildren: React.ReactNode[] = [
      React.createElement(Input, {
        key: 'input',
        ref: inputRef,
        id: inputId,
        name: key,
        type: 'password',
        className: 'credential-input',
        autoComplete: 'off',
        spellCheck: false,
        placeholder: 'Enter new value',
        value,
        onChange: onChange
          ? (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)
          : undefined,
      }),
    ];

    if (isConfigured) {
      inputGroupChildren.push(
        React.createElement(
          Button,
          {
            key: 'clear-btn',
            type: 'button',
            variant: 'secondary',
            size: 'sm',
            className: 'btn-clear-credential',
            'data-key': key,
            'aria-label': `Clear ${key}`,
            onClick: handleClear,
          },
          'Clear',
        ),
      );
    }

    const inputGroupElement = React.createElement(
      'div',
      { className: 'credential-input-group' },
      ...inputGroupChildren,
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

CredentialRow.displayName = 'CredentialRow';
