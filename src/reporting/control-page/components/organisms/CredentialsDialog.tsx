import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { CredentialRowData, DialogMessage } from '../../types/component-contracts.js';
import { Button } from '../atoms/Button.js';
import { CredentialRow } from '../molecules/CredentialRow.js';
import { cn } from '../../utils/cn.js';

export interface CredentialsDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  message: DialogMessage | null;
  credentialRows: CredentialRowData[];
  onClose: () => void;
  onSave: (secretsMap: Record<string, string>) => Promise<boolean>;
  onClear: (key: string) => Promise<boolean>;
}

export function CredentialsDialog({
  isOpen,
  isLoading,
  message,
  credentialRows,
  onClose,
  onSave,
  onClear,
}: CredentialsDialogProps) {
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Clear inputs when dialog closes or opens
  useEffect(() => {
    if (!isOpen) {
      setInputValues({});
    }
  }, [isOpen]);

  const handleInputChange = (key: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSave(inputValues);
      if (success) {
        setInputValues({});
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async (key: string) => {
    await onClear(key);
    setInputValues((prev) => ({ ...prev, [key]: '' }));
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setInputValues({});
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 transition-opacity" />
        <Dialog.Content
          id="credentials-dialog"
          aria-labelledby="credentials-dialog-title"
          className="confirm-dialog credentials-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-300 rounded-lg p-6 shadow-xl max-w-[580px] w-[90vw] focus:outline-none"
        >
          <div id="credentials-form" className="dialog-content">
            <Dialog.Title asChild id="credentials-dialog-title">
              <h2 className="text-xl font-bold text-slate-900 mt-0 mb-1">Local Credential Management</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p className="credentials-notice text-sm text-slate-500 mt-0 mb-4">
                Stored locally in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs text-slate-800">config/secrets.local.json</code> (git-ignored).
              </p>
            </Dialog.Description>

            <div
              id="credentials-message"
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
              id="credentials-loading"
              className={cn(
                'credentials-loading text-sm text-slate-500 italic my-3',
                !isLoading && 'hidden',
              )}
              aria-live="polite"
            >
              Loading credentials...
            </div>

            <div id="credentials-form-rows" className="credentials-form-rows flex flex-col gap-3 my-4 max-h-[380px] overflow-y-auto">
              {credentialRows.length === 0 && !isLoading ? (
                <p className="empty-msg text-sm text-slate-500 italic my-4">
                  No credential variables required for the current configuration.
                </p>
              ) : (
                credentialRows.map((row) => (
                  <CredentialRow
                    key={row.key}
                    secretKey={row.key}
                    isConfigured={row.isConfigured}
                    value={inputValues[row.key] ?? ''}
                    onChange={(val) => handleInputChange(row.key, val)}
                    onClear={handleClear}
                  />
                ))
              )}
            </div>

            <div className="dialog-actions flex justify-end gap-3 mt-4">
              <Button
                type="button"
                id="btn-cancel-credentials"
                variant="secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                id="btn-save-credentials"
                variant="primary"
                loading={isSaving}
                onClick={handleSave}
              >
                Save Credentials
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
