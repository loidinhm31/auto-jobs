import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { BrowserSettingKey, DialogMessage } from '../../types/component-contracts.js';
import type { BrowserSettingsInput } from '../../hooks/useBrowserSettings.js';
import { Button } from '../atoms/Button.js';
import { BrowserSettingRow } from '../molecules/BrowserSettingRow.js';
import { cn } from '../../utils/cn.js';

export interface BrowserSettingsDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  headlessConfigured: boolean;
  execPathConfigured: boolean;
  message: DialogMessage | null;
  onClose: () => void;
  onSave: (settings: BrowserSettingsInput) => Promise<boolean>;
  onClear: (key: BrowserSettingKey) => Promise<boolean>;
}

export function BrowserSettingsDialog({
  isOpen,
  isLoading,
  headlessConfigured,
  execPathConfigured,
  message,
  onClose,
  onSave,
  onClear,
}: BrowserSettingsDialogProps) {
  const [headlessValue, setHeadlessValue] = useState<string>('');
  const [execPathValue, setExecPathValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setExecPathValue('');
      setHeadlessValue('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSave({
        headless: headlessValue,
        executablePath: execPathValue,
      });
      if (success) {
        setExecPathValue('');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async (key: BrowserSettingKey) => {
    await onClear(key);
    if (key === 'PLAYWRIGHT_HEADLESS') {
      setHeadlessValue('');
    } else if (key === 'PLAYWRIGHT_EXECUTABLE_PATH') {
      setExecPathValue('');
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setExecPathValue('');
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 transition-opacity" />
        <Dialog.Content
          id="browser-dialog"
          aria-labelledby="browser-dialog-title"
          className="confirm-dialog browser-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[580px] w-[90vw] focus:outline-none"
        >
          <div id="browser-form" className="dialog-content">
            <Dialog.Title asChild id="browser-dialog-title">
              <h2 className="text-xl font-bold text-slate-900 mt-0 mb-1">Browser Settings</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p className="credentials-notice text-sm text-slate-500 mt-0 mb-4">
                Stored locally in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs text-slate-800">config/secrets.local.json</code> (git-ignored).
              </p>
            </Dialog.Description>

            <div
              id="browser-message"
              className={cn(
                'status-banner',
                message?.type,
                !message && 'hidden',
              )}
              role="status"
              aria-live="polite"
            >
              {message?.text || message?.message || ''}
            </div>

            <div
              id="browser-loading"
              className={cn(
                'credentials-loading text-sm text-slate-500 italic my-3',
                !isLoading && 'hidden',
              )}
              aria-live="polite"
            >
              Loading browser settings...
            </div>

            <div className="browser-form-rows flex flex-col gap-3.5 my-4">
              <BrowserSettingRow
                settingKey="PLAYWRIGHT_HEADLESS"
                isConfigured={headlessConfigured}
                value={headlessValue}
                onChange={setHeadlessValue}
                onClear={handleClear}
              />
              <BrowserSettingRow
                settingKey="PLAYWRIGHT_EXECUTABLE_PATH"
                isConfigured={execPathConfigured}
                value={execPathValue}
                onChange={setExecPathValue}
                onClear={handleClear}
              />
            </div>

            <div className="dialog-actions flex justify-end gap-3 mt-4">
              <Button
                type="button"
                id="btn-cancel-browser"
                variant="secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                id="btn-save-browser"
                variant="primary"
                loading={isSaving}
                onClick={handleSave}
              >
                Save Settings
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
