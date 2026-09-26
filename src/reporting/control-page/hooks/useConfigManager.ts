import { useCallback, useState } from 'react';
import type { ConfigFileListResponse, ConfigResponse, ConfigSummary } from '../types/index.js';
import type { BannerMessage, BannerVariant } from '../types/component-contracts.js';
import { useControlApi, type UseControlApiResult } from './useControlApi.js';
import {
  clearStoredActiveConfig,
  readStoredActiveConfig,
  readUrlActiveConfig,
  resolveActiveConfigName,
  syncUrlActiveConfig,
  writeStoredActiveConfig,
} from '../utils/config-selection.js';
import { useConfigDocumentEditor, type UseConfigDocumentEditorResult } from './useConfigDocumentEditor.js';

export interface JsonValidationStatus {
  isValid: boolean;
  message: string;
}

export interface UseConfigManagerResult extends Omit<
  UseConfigDocumentEditorResult,
  'setDocument' | 'validateCurrentDocument'
> {
  configList: ConfigSummary[];
  activeConfigName: string;
  etag: string;
  isLoading: boolean;
  banner: BannerMessage | null;
  loadConfigList: () => Promise<void>;
  loadConfig: (name: string) => Promise<void>;
  reloadConfig: () => Promise<void>;
  saveConfig: () => Promise<boolean>;
  showBanner: (type: BannerVariant, message: string) => void;
  hideBanner: () => void;
}

/**
 * Hook managing configuration file listing, retrieval, editing, raw JSON synchronization,
 * dirty state tracking, and concurrency-safe saving with ETag headers.
 */
export function useConfigManager(apiOverride?: UseControlApiResult): UseConfigManagerResult {
  const defaultApi = useControlApi();
  const api = apiOverride ?? defaultApi;
  const [configList, setConfigList] = useState<ConfigSummary[]>([]);
  const [activeConfigName, setActiveConfigName] = useState('');
  const [etag, setEtag] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [banner, setBanner] = useState<BannerMessage | null>(null);
  const editor = useConfigDocumentEditor();
  const { setDocument, validateCurrentDocument, ...publicEditor } = editor;
  const { replaceDocument } = editor;

  const showBanner = useCallback((type: BannerVariant, message: string) => {
    setBanner({ type, message });
  }, []);

  const hideBanner = useCallback(() => {
    setBanner(null);
  }, []);

  const loadConfig = useCallback(async (name: string): Promise<void> => {
    if (!name) return;
    hideBanner();
    setIsLoading(true);
    try {
      const { data } = await api.requestJson<ConfigResponse>(
        `/api/config?name=${encodeURIComponent(name)}`,
      );
      setActiveConfigName(data.name);
      setEtag(data.etag);
      replaceDocument(data.document);
      writeStoredActiveConfig(data.name);
      syncUrlActiveConfig(data.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showBanner('error', `Failed to load config: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [api, hideBanner, replaceDocument, showBanner]);

  const loadConfigList = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const { data } = await api.requestJson<ConfigFileListResponse>('/api/configs');
      const configs = data.configs || [];
      setConfigList(configs);
      if (configs.length > 0) {
        const resolvedName = resolveActiveConfigName({
          availableConfigs: configs.map((config) => config.name),
          queryCandidate: readUrlActiveConfig(),
          storedCandidate: readStoredActiveConfig(),
        });
        if (resolvedName) await loadConfig(resolvedName);
      } else {
        clearStoredActiveConfig();
        syncUrlActiveConfig(null);
        setActiveConfigName('');
        setEtag('');
        replaceDocument(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showBanner('error', `Error loading configs: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [api, loadConfig, replaceDocument, showBanner]);

  const reloadConfig = useCallback(async (): Promise<void> => {
    if (activeConfigName) await loadConfig(activeConfigName);
  }, [activeConfigName, loadConfig]);

  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!publicEditor.currentDoc || !activeConfigName) return false;
    hideBanner();
    if (!validateCurrentDocument()) {
      showBanner('error', 'Cannot save an invalid configuration. Fix the indicated fields first.');
      return false;
    }
    setIsLoading(true);
    try {
      const resp = await api.apiFetch(
        `/api/config?name=${encodeURIComponent(activeConfigName)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': etag,
          },
          body: JSON.stringify(publicEditor.currentDoc),
        },
      );

      if (resp.status === 409 || resp.status === 412) {
        showBanner('error', 'Conflict: Config was modified elsewhere. Please reload.');
        return false;
      }

      if (!resp.ok) {
        let errText = `HTTP ${resp.status}`;
        try {
          const errJson = (await resp.json()) as { error?: { message?: string } };
          if (errJson?.error?.message) errText = errJson.error.message;
        } catch {
          // Ignore json parse error on response
        }
        showBanner('error', `Save failed: ${errText}`);
        return false;
      }

      const data = (await resp.json()) as ConfigResponse;
      setEtag(data.etag);
      setDocument(data.document);
      showBanner('success', 'Configuration saved successfully.');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showBanner('error', `Save failed: ${message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [
    activeConfigName,
    api,
    etag,
    hideBanner,
    publicEditor.currentDoc,
    setDocument,
    showBanner,
    validateCurrentDocument,
  ]);

  return {
    ...publicEditor,
    configList,
    activeConfigName,
    etag,
    isLoading,
    banner,
    loadConfigList,
    loadConfig,
    reloadConfig,
    saveConfig,
    showBanner,
    hideBanner,
  };
}
