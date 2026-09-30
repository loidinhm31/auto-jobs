import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type {
  BrowserName,
  ProjectConfigInput,
  ProjectCredentialReferences,
} from '../../types/index.js';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';
import { Select } from '../atoms/Select.js';

export interface MatrixRowSettingsProps {
  isOpen: boolean;
  project: ProjectConfigInput;
  projectIndex: number;
  defaultsCredentials?: ProjectCredentialReferences | undefined;
  validationErrors?: readonly string[] | undefined;
  onClose: () => void;
  onSave: (updated: ProjectConfigInput) => void;
}

const BROWSER_OPTIONS: { value: BrowserName; label: string }[] = [
  { value: 'chromium', label: 'Chromium' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'webkit', label: 'WebKit' },
];

export function MatrixRowSettings({
  isOpen,
  project,
  defaultsCredentials,
  onClose,
  onSave,
}: MatrixRowSettingsProps) {
  const [draft, setDraft] = useState<ProjectConfigInput>({ ...project });

  useEffect(() => {
    if (isOpen) setDraft({ ...project });
  }, [isOpen, project]);

  const updateDraft = <K extends keyof ProjectConfigInput>(field: K, value: ProjectConfigInput[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateCredential = (key: 'usernameVariable' | 'passwordVariable', value: string) => {
    setDraft((prev) => {
      const current = prev.credentials ?? defaultsCredentials;
      const nextCreds = {
        usernameVariable: current?.usernameVariable ?? '',
        passwordVariable: current?.passwordVariable ?? '',
        [key]: value,
      };
      if (!nextCreds.usernameVariable && !nextCreds.passwordVariable) {
        const { credentials: _removed, ...rest } = prev;
        return rest as ProjectConfigInput;
      }
      return { ...prev, credentials: nextCreds };
    });
  };

  const handleApply = () => {
    onSave(draft);
    onClose();
  };

  const titleElement = React.createElement(
    Dialog.Title,
    { id: `dialog-title-${project.id}`, className: 'text-base font-semibold text-slate-900 mb-1' },
    `Project Settings: ${project.name || project.id}`,
  );

  const descElement = React.createElement(
    Dialog.Description,
    { className: 'text-xs text-slate-500 mb-4' },
    `Advanced settings for ${project.id}. Group metadata is preserved automatically.`,
  );

  const loginInput = React.createElement(Input, {
    id: `settings-login-url-${project.id}`, label: 'Login URL', value: draft.loginUrl,
    onChange: (e) => updateDraft('loginUrl', e.target.value), placeholder: 'https://jenkins.example.com/login',
  });
  const browserSelect = React.createElement(Select, {
    id: `settings-browser-${project.id}`, label: 'Browser', value: draft.browser ?? 'chromium',
    options: BROWSER_OPTIONS, onChange: (e) => updateDraft('browser', e.target.value as BrowserName),
  });
  const timeoutInput = React.createElement(Input, {
    id: `settings-timeout-${project.id}`, label: 'Timeout (ms)', type: 'number',
    value: draft.timeoutMs !== undefined ? String(draft.timeoutMs) : '',
    onChange: (e) => updateDraft('timeoutMs', e.target.value ? Number(e.target.value) : undefined),
  });
  const waitTimeoutInput = React.createElement(Input, {
    id: `settings-wait-timeout-${project.id}`, label: 'Wait Timeout (ms)', type: 'number',
    value: draft.waitTimeoutMs !== undefined ? String(draft.waitTimeoutMs) : '',
    onChange: (e) => updateDraft('waitTimeoutMs', e.target.value ? Number(e.target.value) : undefined),
  });
  const artifactDirInput = React.createElement('div', { className: 'sm:col-span-2' }, React.createElement(Input, {
    id: `settings-artifact-dir-${project.id}`, label: 'Artifact Directory', value: draft.artifactDir ?? '',
    onChange: (e) => updateDraft('artifactDir', e.target.value || undefined), placeholder: 'Optional custom artifact folder',
  }));

  const credSection = React.createElement(
    'div', { className: 'sm:col-span-2 border-t pt-3' },
    React.createElement('span', { className: 'font-medium text-slate-800 block mb-2' }, 'Credential References'),
    React.createElement('div', { className: 'grid sm:grid-cols-2 gap-2' },
      React.createElement(Input, {
        id: `settings-cred-user-${project.id}`, label: 'Username Env Var',
        value: draft.credentials?.usernameVariable ?? '',
        placeholder: defaultsCredentials?.usernameVariable ? `Default: ${defaultsCredentials.usernameVariable}` : 'JENKINS_USER',
        onChange: (e) => updateCredential('usernameVariable', e.target.value),
      }),
      React.createElement(Input, {
        id: `settings-cred-pass-${project.id}`, label: 'Password Env Var',
        value: draft.credentials?.passwordVariable ?? '',
        placeholder: defaultsCredentials?.passwordVariable ? `Default: ${defaultsCredentials.passwordVariable}` : 'JENKINS_PASS',
        onChange: (e) => updateCredential('passwordVariable', e.target.value),
      }),
    ),
    draft.credentials ? React.createElement('button', {
      type: 'button', id: `btn-reset-creds-${project.id}`,
      onClick: () => setDraft((p) => { const { credentials: _, ...r } = p; return r as ProjectConfigInput; }),
      className: 'mt-2 text-xs text-sky-600 hover:underline',
    }, 'Use default credential references') : null,
  );

  const flagsSection = React.createElement(
    'div',
    { className: 'sm:col-span-2 flex flex-col gap-2 pt-2 border-t' },
    React.createElement(
      'label',
      { className: 'flex items-center gap-2 cursor-pointer' },
      React.createElement('input', {
        type: 'checkbox',
        id: `checkbox-enabled-${project.id}`,
        checked: draft.enabled !== false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateDraft('enabled', e.target.checked),
        className: 'h-4 w-4 accent-sky-700 rounded border-slate-300',
      }),
      React.createElement('span', { className: 'font-medium text-slate-800' }, 'Enabled'),
    ),
    React.createElement(
      'label',
      { className: 'flex items-center gap-2 cursor-pointer' },
      React.createElement('input', {
        type: 'checkbox',
        id: `checkbox-wait-${project.id}`,
        checked: draft.waitForCompletion !== false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateDraft('waitForCompletion', e.target.checked),
        className: 'h-4 w-4 accent-sky-700 rounded border-slate-300',
      }),
      React.createElement('span', { className: 'text-slate-700' }, 'Wait for completion in Stage View'),
    ),
  );

  const gridContainer = React.createElement(
    'div',
    { className: 'grid gap-3 sm:grid-cols-2 text-xs' },
    loginInput,
    browserSelect,
    timeoutInput,
    waitTimeoutInput,
    artifactDirInput,
    credSection,
    flagsSection,
  );

  const footerActions = React.createElement(
    'div',
    { className: 'flex justify-end gap-2 mt-6 pt-3 border-t' },
    React.createElement(Button, { variant: 'secondary', onClick: onClose, id: `btn-cancel-settings-${project.id}` }, 'Cancel'),
    React.createElement(Button, { variant: 'primary', onClick: handleApply, id: `btn-apply-settings-${project.id}` }, 'Apply Settings'),
  );

  const content = React.createElement(
    Dialog.Content,
    {
      id: `dialog-project-settings-${project.id}`,
      'aria-labelledby': `dialog-title-${project.id}`,
      forceMount: true,
      className:
        'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[640px] w-[95vw] max-h-[85vh] overflow-y-auto focus:outline-none',
    },
    titleElement,
    descElement,
    gridContainer,
    footerActions,
  );

  return React.createElement(
    Dialog.Root,
    { open: isOpen, onOpenChange: (open) => { if (!open) onClose(); } },
    React.createElement(
      Dialog.Portal,
      { forceMount: true },
      React.createElement(Dialog.Overlay, { forceMount: true, className: 'fixed inset-0 bg-black/50 z-50 transition-opacity' }),
      content,
    ),
  );
}
