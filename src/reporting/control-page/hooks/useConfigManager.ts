import { useCallback, useState } from 'react';
import type {
  ConfigFileListResponse,
  ConfigResponse,
  ConfigSummary,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../types/index.js';
import type { BannerMessage, BannerVariant } from '../types/component-contracts.js';
import { ControlApiError, useControlApi, type UseControlApiResult } from './useControlApi.js';

export interface JsonValidationStatus {
  isValid: boolean;
  message: string;
}

export interface UseConfigManagerResult {
  configList: ConfigSummary[];
  activeConfigName: string;
  currentDoc: ProjectConfigDocumentV1 | null;
  rawJsonString: string;
  etag: string;
  isDirty: boolean;
  isLoading: boolean;
  banner: BannerMessage | null;
  jsonValidationMsg: JsonValidationStatus | null;
  loadConfigList: () => Promise<void>;
  loadConfig: (name: string) => Promise<void>;
  reloadConfig: () => Promise<void>;
  saveConfig: () => Promise<boolean>;
  applyRawJson: (jsonString?: string) => boolean;
  updateProject: (
    projectId: string,
    changes: Partial<ProjectConfigInput> | ((prev: ProjectConfigInput) => ProjectConfigInput),
  ) => void;
  setRawJsonString: (val: string) => void;
  setActiveConfigName: (name: string) => void;
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
  const [activeConfigName, setActiveConfigName] = useState<string>('');
  const [currentDoc, setCurrentDoc] = useState<ProjectConfigDocumentV1 | null>(null);
  const [rawJsonString, setRawJsonString] = useState<string>('');
  const [etag, setEtag] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [banner, setBanner] = useState<BannerMessage | null>(null);
  const [jsonValidationMsg, setJsonValidationMsg] = useState<JsonValidationStatus | null>(null);

  const showBanner = useCallback((type: BannerVariant, message: string) => {
    setBanner({ type, message });
  }, []);

  const hideBanner = useCallback(() => {
    setBanner(null);
  }, []);

  const loadConfig = useCallback(
    async (name: string): Promise<void> => {
      if (!name) return;
      hideBanner();
      setIsLoading(true);
      try {
        const { data } = await api.requestJson<ConfigResponse>(
          `/api/config?name=${encodeURIComponent(name)}`,
        );
        setActiveConfigName(data.name);
        setEtag(data.etag);
        setCurrentDoc(data.document);
        setRawJsonString(JSON.stringify(data.document, null, 2));
        setIsDirty(false);
        setJsonValidationMsg(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showBanner('error', `Failed to load config: ${message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [api, hideBanner, showBanner],
  );

  const loadConfigList = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const { data } = await api.requestJson<ConfigFileListResponse>('/api/configs');
      const configs = data.configs || [];
      setConfigList(configs);
      if (configs.length > 0) {
        const first = configs[0]?.name;
        if (first) {
          setActiveConfigName(first);
          await loadConfig(first);
        }
      } else {
        setActiveConfigName('');
        setCurrentDoc(null);
        setRawJsonString('');
        setEtag('');
        setIsDirty(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showBanner('error', `Error loading configs: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [api, loadConfig, showBanner]);

  const reloadConfig = useCallback(async (): Promise<void> => {
    if (activeConfigName) {
      await loadConfig(activeConfigName);
    }
  }, [activeConfigName, loadConfig]);

  const applyRawJson = useCallback(
    (explicitJsonString?: string): boolean => {
      const textToParse = explicitJsonString ?? rawJsonString;
      try {
        const parsed = JSON.parse(textToParse) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Config must be a JSON object');
        }
        const parsedObj = parsed as Record<string, unknown>;
        if (!Array.isArray(parsedObj['projects'])) {
          throw new Error('Config must contain a "projects" array');
        }
        const validatedDoc = parsed as ProjectConfigDocumentV1;
        setCurrentDoc(validatedDoc);
        if (explicitJsonString !== undefined) {
          setRawJsonString(explicitJsonString);
        }
        setJsonValidationMsg({
          isValid: true,
          message: 'JSON valid and applied to model.',
        });
        setIsDirty(true);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setJsonValidationMsg({
          isValid: false,
          message: `Invalid JSON: ${message}`,
        });
        return false;
      }
    },
    [rawJsonString],
  );

  const updateProject = useCallback(
    (
      projectId: string,
      changes: Partial<ProjectConfigInput> | ((prev: ProjectConfigInput) => ProjectConfigInput),
    ): void => {
      if (!currentDoc) return;
      const projects = (currentDoc.projects || []).map((project) => {
        if (project.id === projectId) {
          return typeof changes === 'function' ? changes(project) : { ...project, ...changes };
        }
        return project;
      });
      const updatedDoc: ProjectConfigDocumentV1 = {
        ...currentDoc,
        projects,
      };
      setCurrentDoc(updatedDoc);
      setRawJsonString(JSON.stringify(updatedDoc, null, 2));
      setIsDirty(true);
      setJsonValidationMsg(null);
    },
    [currentDoc],
  );

  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!currentDoc || !activeConfigName) return false;
    hideBanner();
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
          body: JSON.stringify(currentDoc),
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
          if (errJson?.error?.message) {
            errText = errJson.error.message;
          }
        } catch {
          // Ignore json parse error on response
        }
        showBanner('error', `Save failed: ${errText}`);
        return false;
      }

      const data = (await resp.json()) as ConfigResponse;
      setEtag(data.etag);
      setCurrentDoc(data.document);
      setRawJsonString(JSON.stringify(data.document, null, 2));
      setIsDirty(false);
      showBanner('success', 'Configuration saved successfully.');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showBanner('error', `Save failed: ${message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeConfigName, api, currentDoc, etag, hideBanner, showBanner]);

  return {
    configList,
    activeConfigName,
    currentDoc,
    rawJsonString,
    etag,
    isDirty,
    isLoading,
    banner,
    jsonValidationMsg,
    loadConfigList,
    loadConfig,
    reloadConfig,
    saveConfig,
    applyRawJson,
    updateProject,
    setRawJsonString,
    setActiveConfigName,
    showBanner,
    hideBanner,
  };
}
