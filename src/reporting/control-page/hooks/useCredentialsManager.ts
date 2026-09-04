import { useCallback, useState } from 'react';
import type { ProjectConfigDocumentV1, SecretsPresenceMap } from '../types/index.js';
import type { CredentialRowData, DialogMessage } from '../types/component-contracts.js';
import { discoverRequiredCredentialKeys } from '../utils/discoverCredentialKeys.js';
import { useControlApi, type UseControlApiResult } from './useControlApi.js';

export interface UseCredentialsManagerResult {
  isOpen: boolean;
  isLoading: boolean;
  message: DialogMessage | null;
  credentialRows: CredentialRowData[];
  openDialog: (doc?: ProjectConfigDocumentV1 | null) => Promise<void>;
  closeDialog: () => void;
  saveCredentials: (secretsMap: Record<string, string>) => Promise<boolean>;
  clearCredential: (key: string) => Promise<boolean>;
  clearMessage: () => void;
  setMessage: (msg: DialogMessage | null) => void;
}

/**
 * Hook for managing dynamic project credential variables: discovering required keys,
 * checking secret presence, saving new values, and deleting individual secrets.
 */
export function useCredentialsManager(apiOverride?: UseControlApiResult): UseCredentialsManagerResult {
  const defaultApi = useControlApi();
  const api = apiOverride ?? defaultApi;

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<DialogMessage | null>(null);
  const [credentialRows, setCredentialRows] = useState<CredentialRowData[]>([]);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  const openDialog = useCallback(
    async (doc?: ProjectConfigDocumentV1 | null): Promise<void> => {
      setMessage(null);
      setIsOpen(true);

      const keys = discoverRequiredCredentialKeys(doc);
      if (keys.length === 0) {
        setCredentialRows([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data } = await api.requestJson<SecretsPresenceMap>(
          `/api/secrets?keys=${encodeURIComponent(keys.join(','))}`,
        );
        const presence = data.secrets || {};
        const rows: CredentialRowData[] = keys.map((k) => ({
          key: k,
          isConfigured: Boolean(presence[k]),
        }));
        setCredentialRows(rows);
      } catch (err) {
        const errText = err instanceof Error ? err.message : String(err);
        setMessage({ type: 'error', text: `Failed to load credentials: ${errText}` });
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setMessage(null);
  }, []);

  const saveCredentials = useCallback(
    async (secretsMap: Record<string, string>): Promise<boolean> => {
      setMessage(null);
      const SAFE_SECRET_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
      const cleaned: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const [key, val] of Object.entries(secretsMap)) {
        if (!SAFE_SECRET_KEY.test(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }
        const trimmed = typeof val === 'string' ? val.trim() : '';
        if (trimmed.length > 0) {
          cleaned[key] = trimmed;
        }
      }

      const changedKeys = Object.keys(cleaned);
      if (changedKeys.length === 0) {
        setMessage({ type: 'info', text: 'No changes entered.' });
        return false;
      }

      setIsLoading(true);
      try {
        const resp = await api.apiFetch('/api/secrets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secrets: cleaned }),
        });

        if (!resp.ok) {
          let errText = `HTTP ${resp.status}`;
          try {
            const errJson = (await resp.json()) as { error?: { message?: string } };
            if (errJson?.error?.message) {
              errText = errJson.error.message;
            }
          } catch {
            // Ignore parse error
          }
          throw new Error(errText);
        }

        setCredentialRows((prev) =>
          prev.map((row) => (changedKeys.includes(row.key) ? { ...row, isConfigured: true } : row)),
        );
        setMessage({ type: 'success', text: 'Credentials saved successfully.' });
        return true;
      } catch (err) {
        const errText = err instanceof Error ? err.message : String(err);
        setMessage({ type: 'error', text: `Failed to save credentials: ${errText}` });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  const clearCredential = useCallback(
    async (key: string): Promise<boolean> => {
      setMessage(null);
      setIsLoading(true);
      try {
        const resp = await api.apiFetch(`/api/secrets?name=${encodeURIComponent(key)}`, {
          method: 'DELETE',
        });

        if (!resp.ok) {
          let errText = `HTTP ${resp.status}`;
          try {
            const errJson = (await resp.json()) as { error?: { message?: string } };
            if (errJson?.error?.message) {
              errText = errJson.error.message;
            }
          } catch {
            // Ignore parse error
          }
          throw new Error(errText);
        }

        setCredentialRows((prev) =>
          prev.map((row) => (row.key === key ? { ...row, isConfigured: false } : row)),
        );
        setMessage({ type: 'success', text: `${key} cleared.` });
        return true;
      } catch (err) {
        const errText = err instanceof Error ? err.message : String(err);
        setMessage({ type: 'error', text: `Failed to clear ${key}: ${errText}` });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  return {
    isOpen,
    isLoading,
    message,
    credentialRows,
    openDialog,
    closeDialog,
    saveCredentials,
    clearCredential,
    clearMessage,
    setMessage,
  };
}
