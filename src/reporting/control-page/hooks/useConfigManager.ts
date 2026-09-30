import { useCallback, useRef, useState } from 'react';
import type { ConfigFileListResponse, ConfigResponse, ConfigSummary } from '../types/index.js';
import type { BannerMessage, BannerVariant } from '../types/component-contracts.js';
import { useControlApi, type UseControlApiResult } from './useControlApi.js';
import { fetchConfigDocument, saveConfigDocument } from './config-document-io.js';
import {
 clearStoredActiveConfig,
 readStoredActiveConfig,
 readUrlActiveConfig,
 resolveActiveConfigName,
 syncUrlActiveConfig,
 writeStoredActiveConfig,
} from '../utils/config-selection.js';
import { projectLegacyMatrixDocument } from '../../../config/project-job-matrix-upgrade.js';
import type { ProjectConfigDocumentV1 } from '../../../config/config-types.js';
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
 updateDocument: (nextDoc: ProjectConfigDocumentV1) => void;
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
 const loadSequenceRef = useRef(0);
 const editor = useConfigDocumentEditor();
 const { setDocument, validateCurrentDocument, ...publicEditor } = editor;
 const { replaceDocument } = editor;
 const showBanner = useCallback((type: BannerVariant, message: string) => {
  setBanner({ type, message });
 }, []);

 const hideBanner = useCallback(() => {
  setBanner(null);
 }, []);

 const adoptConfig = useCallback((data: ConfigResponse) => {
  setActiveConfigName(data.name);
  setEtag(data.etag);
  replaceDocument(projectLegacyMatrixDocument(data.document));
  writeStoredActiveConfig(data.name);
  syncUrlActiveConfig(data.name);
 }, [replaceDocument]);

 const loadConfig = useCallback(async (name: string): Promise<void> => {
  if (!name) return;
  hideBanner();
  setIsLoading(true);
  const seq = ++loadSequenceRef.current;
  try {
   const data = await fetchConfigDocument(api, name);
   if (seq !== loadSequenceRef.current) return;
   adoptConfig(data);
  } catch (err) {
   if (seq !== loadSequenceRef.current) return;
   const message = err instanceof Error ? err.message : String(err);
   showBanner('error', `Failed to load config: ${message}`);
  } finally {
   if (seq === loadSequenceRef.current) {
    setIsLoading(false);
   }
  }
 }, [adoptConfig, api, hideBanner, showBanner]);

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
  const seq = ++loadSequenceRef.current;
  const targetName = activeConfigName;
  try {
   const saveRes = await saveConfigDocument(api, targetName, etag, publicEditor.currentDoc);
   if (!saveRes.ok) {
    showBanner('error', saveRes.error);
    return false;
   }
   if (seq !== loadSequenceRef.current) return false;

   try {
    const getData = await fetchConfigDocument(api, targetName);
    if (seq !== loadSequenceRef.current) return false;
    adoptConfig(getData);
    showBanner('success', 'Configuration saved successfully.');
    return true;
   } catch {
    setEtag(saveRes.data.etag);
    showBanner('error', 'Configuration saved, but reload failed. Click Reload to synchronize.');
    return false;
   }
  } catch (err) {
   const message = err instanceof Error ? err.message : String(err);
   showBanner('error', `Save failed: ${message}`);
   return false;
  } finally {
   if (seq === loadSequenceRef.current) {
    setIsLoading(false);
   }
  }
 }, [activeConfigName, adoptConfig, api, etag, hideBanner, publicEditor.currentDoc, showBanner, validateCurrentDocument]);

 const updateDocument = useCallback((nextDoc: ProjectConfigDocumentV1) => {
  if (nextDoc !== publicEditor.currentDoc) {
   setDocument(nextDoc, true);
  }
 }, [publicEditor.currentDoc, setDocument]);

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
  updateDocument,
 };
}
