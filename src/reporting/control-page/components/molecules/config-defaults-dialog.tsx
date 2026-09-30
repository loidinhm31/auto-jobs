import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { BrowserName, ProjectConfigDefaults } from '../../types/index.js';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';
import { Select } from '../atoms/Select.js';

export interface ConfigDefaultsDialogProps {
  isOpen: boolean;
  defaults: ProjectConfigDefaults | undefined;
  validationErrors?: readonly string[];
  onClose: () => void;
  onUpdate: (update: (previous: ProjectConfigDefaults) => ProjectConfigDefaults) => void;
}

const BROWSER_OPTIONS: { value: BrowserName | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'chromium', label: 'Chromium' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'webkit', label: 'WebKit' },
];

export function ConfigDefaultsDialog({
  isOpen,
  defaults,
  validationErrors = [],
  onClose,
  onUpdate,
}: ConfigDefaultsDialogProps) {
  const credentials = defaults?.credentials;
  const fieldError = (field: string): string =>
    validationErrors.find((e) => e.startsWith(`config.defaults.${field} `)) ?? '';

  const updateField = (key: 'timeoutMs' | 'browser' | 'artifactDir', value: string) => {
    onUpdate((previous) => {
      if (!value) {
        const { [key]: _removed, ...rest } = previous;
        return rest;
      }
      return {
        ...previous,
        [key]: key === 'timeoutMs' ? Number(value) : key === 'browser' ? (value as BrowserName) : value,
      };
    });
  };

  const updateCredential = (key: 'usernameVariable' | 'passwordVariable', value: string) => {
    onUpdate((previous) => {
      const current = previous.credentials;
      const next = {
        usernameVariable: current?.usernameVariable ?? '',
        passwordVariable: current?.passwordVariable ?? '',
        [key]: value,
      };
      if (next.usernameVariable || next.passwordVariable) return { ...previous, credentials: next };
      const { credentials: _removed, ...rest } = previous;
      return rest;
    });
  };

  const titleElement = React.createElement(
    Dialog.Title,
    { id: 'dialog-defaults-title', className: 'text-base font-semibold text-slate-900 mb-1' },
    'Default Configuration Settings',
  );

  const descElement = React.createElement(
    Dialog.Description,
    { className: 'text-xs text-slate-500 mb-4' },
    'Applied to projects that do not override these settings.',
  );

  const timeoutInput = React.createElement(Input, {
    id: 'config-default-timeout', label: 'Default timeout (ms)', type: 'number',
    min: 1000, max: 3600000, value: defaults?.timeoutMs == null ? '' : String(defaults.timeoutMs),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateField('timeoutMs', e.target.value),
    error: fieldError('timeoutMs'),
  });

  const browserSelect = React.createElement(Select, {
    id: 'config-default-browser', label: 'Default browser', value: defaults?.browser ?? '',
    options: BROWSER_OPTIONS, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => updateField('browser', e.target.value),
    'aria-invalid': Boolean(fieldError('browser')),
  });

  const artifactDirInput = React.createElement('div', { className: 'sm:col-span-2' }, React.createElement(Input, {
    id: 'config-default-artifact-dir', label: 'Default artifact directory', value: defaults?.artifactDir ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateField('artifactDir', e.target.value),
    error: fieldError('artifactDir'), placeholder: 'Optional shared artifact directory',
  }));

  const credSection = React.createElement(
    'div', { className: 'sm:col-span-2 border-t pt-3' },
    React.createElement('span', { className: 'font-medium text-slate-800 block mb-2' }, 'Default Credential References'),
    React.createElement('div', { className: 'grid sm:grid-cols-2 gap-2' },
      React.createElement(Input, {
        id: 'config-default-usernameVariable', label: 'Username Env Var', value: credentials?.usernameVariable ?? '',
        placeholder: 'e.g. JENKINS_USERNAME', onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateCredential('usernameVariable', e.target.value),
        error: fieldError('credentials.usernameVariable'),
      }),
      React.createElement(Input, {
        id: 'config-default-passwordVariable', label: 'Password Env Var', value: credentials?.passwordVariable ?? '',
        placeholder: 'e.g. JENKINS_PASSWORD', onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateCredential('passwordVariable', e.target.value),
        error: fieldError('credentials.passwordVariable'),
      }),
    ),
  );

  const gridContainer = React.createElement(
    'div', { className: 'grid gap-3 sm:grid-cols-2 text-xs' },
    timeoutInput, browserSelect, artifactDirInput, credSection,
  );

  const footerActions = React.createElement(
    'div', { className: 'flex justify-end gap-2 mt-6 pt-3 border-t' },
    React.createElement(Button, { variant: 'primary', onClick: onClose, id: 'btn-close-defaults' }, 'Done'),
  );

  const content = React.createElement(
    Dialog.Content,
    {
      id: 'dialog-defaults-settings', 'aria-labelledby': 'dialog-defaults-title',
      className:
        'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[580px] w-[95vw] max-h-[85vh] overflow-y-auto focus:outline-none',
    },
    titleElement, descElement, gridContainer, footerActions,
  );

  return React.createElement(
    Dialog.Root, { open: isOpen, onOpenChange: (open) => { if (!open) onClose(); } },
    React.createElement(Dialog.Portal, null,
      React.createElement(Dialog.Overlay, { className: 'fixed inset-0 bg-black/50 z-50 transition-opacity' }),
      content,
    ),
  );
}
