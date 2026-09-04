import { useCallback, useState } from 'react';
import type { BrowserSettingKey, SecretsPresenceMap } from '../types/index.js';
import type { DialogMessage } from '../types/component-contracts.js';
import { useControlApi, type UseControlApiResult } from './useControlApi.js';

export interface BrowserSettingsInput {
  headless?: string;
  executablePath?: string;
}

export interface UseBrowserSettingsResult {
  isOpen: boolean;
  isLoading: boolean;
  headlessConfigured: boolean;
  execPathConfigured: boolean;
  message: DialogMessage | null;
  openDialog: () => Promise<void>;
  closeDialog: () => void;
  saveBrowserSettings: (settings: BrowserSettingsInput) => Promise<boolean>;
  clearSetting: (key: BrowserSettingKey) => Promise<boolean>;
  clearMessage: () => void;
  setMessage: (msg: DialogMessage | null) => void;
}

const BROWSER_SETTING_KEYS: readonly BrowserSettingKey[] = [
  'PLAYWRIGHT_HEADLESS',
  'PLAYWRIGHT_EXECUTABLE_PATH',
] as const;

/**
 * Hook managing browser settings (PLAYWRIGHT_HEADLESS and PLAYWRIGHT_EXECUTABLE_PATH)
 * stored securely in the report server secret store.
 */
export function useBrowserSettings(apiOverride?: UseControlApiResult): UseBrowserSettingsResult {
  const defaultApi = useControlApi();
  const api = apiOverride ?? defaultApi;

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [headlessConfigured, setHeadlessConfigured] = useState<boolean>(false);
  const [execPathConfigured, setExecPathConfigured] = useState<boolean>(false);
  const [message, setMessage] = useState<DialogMessage | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  const openDialog = useCallback(async (): Promise<void> => {
    setMessage(null);
    setIsOpen(true);
    setIsLoading(true);

    try {
      const keysParam = BROWSER_SETTING_KEYS.join(',');
      const { data } = await api.requestJson<SecretsPresenceMap>(
        `/api/secrets?keys=${encodeURIComponent(keysParam)}`,
      );
      const presence = data.secrets || {};
      setHeadlessConfigured(Boolean(presence['PLAYWRIGHT_HEADLESS']));
      setExecPathConfigured(Boolean(presence['PLAYWRIGHT_EXECUTABLE_PATH']));
    } catch (err) {
      const errText = err instanceof Error ? err.message : String(err);
      setMessage({ type: 'error', text: `Failed to load browser settings: ${errText}` });
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setMessage(null);
  }, []);

  const saveBrowserSettings = useCallback(
    async (settings: BrowserSettingsInput): Promise<boolean> => {
      setMessage(null);
      const secrets: Record<string, string> = {};

      const headlessVal = settings.headless?.trim();
      const execPathVal = settings.executablePath?.trim();

      if (headlessVal && headlessVal.length > 0) {
        secrets['PLAYWRIGHT_HEADLESS'] = headlessVal;
      }
      if (execPathVal && execPathVal.length > 0) {
        secrets['PLAYWRIGHT_EXECUTABLE_PATH'] = execPathVal;
      }

      if (Object.keys(secrets).length === 0) {
        setMessage({ type: 'info', text: 'No changes entered.' });
        return false;
      }

      setIsLoading(true);
      try {
        const resp = await api.apiFetch('/api/secrets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secrets }),
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

        const data = (await resp.json()) as SecretsPresenceMap;
        const presence = data.secrets || {};
        setHeadlessConfigured(Boolean(presence['PLAYWRIGHT_HEADLESS']));
        setExecPathConfigured(Boolean(presence['PLAYWRIGHT_EXECUTABLE_PATH']));
        setMessage({ type: 'success', text: 'Browser settings saved successfully.' });
        return true;
      } catch (err) {
        const errText = err instanceof Error ? err.message : String(err);
        setMessage({ type: 'error', text: `Failed to save browser settings: ${errText}` });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  const clearSetting = useCallback(
    async (key: BrowserSettingKey): Promise<boolean> => {
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

        const data = (await resp.json()) as SecretsPresenceMap;
        const presence = data.secrets || {};
        setHeadlessConfigured(Boolean(presence['PLAYWRIGHT_HEADLESS']));
        setExecPathConfigured(Boolean(presence['PLAYWRIGHT_EXECUTABLE_PATH']));
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
    headlessConfigured,
    execPathConfigured,
    message,
    openDialog,
    closeDialog,
    saveBrowserSettings,
    clearSetting,
    clearMessage,
    setMessage,
  };
}
