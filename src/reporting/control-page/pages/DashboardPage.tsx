import React, { useEffect, useMemo, useState } from 'react';
import type { ProjectCardData } from '../types/component-contracts.js';
import { useConfigManager } from '../hooks/useConfigManager.js';
import { useCredentialsManager } from '../hooks/useCredentialsManager.js';
import { useBrowserSettings, type BrowserSettingsInput } from '../hooks/useBrowserSettings.js';
import { useRunPoller } from '../hooks/useRunPoller.js';
import { StatusBanner } from '../components/atoms/StatusBanner.js';
import { HeaderBar } from '../components/organisms/HeaderBar.js';
import { ProjectsGrid } from '../components/organisms/ProjectsGrid.js';
import { RawJsonSection } from '../components/organisms/RawJsonSection.js';
import { ConfigFormBuilder } from '../components/organisms/ConfigFormBuilder.js';
import { ExecutionSection } from '../components/organisms/ExecutionSection.js';
import { RunStatusCard } from '../components/organisms/RunStatusCard.js';
import { CredentialsDialog } from '../components/organisms/CredentialsDialog.js';
import { BrowserSettingsDialog } from '../components/organisms/BrowserSettingsDialog.js';
import { DashboardLayout } from '../components/templates/DashboardLayout.js';

export function DashboardPage() {
  const {
    configList,
    activeConfigName,
    currentDoc,
    rawJsonString,
    etag,
    isDirty,
    isLoading: isConfigLoading,
    banner,
    jsonValidationMsg,
    validationErrors,
    updateProjectAt,
    addProject,
    removeProjectAt,
    updateDefaults,
    updateReportWorkers,
    loadConfigList,
    loadConfig,
    reloadConfig,
    saveConfig,
    applyRawJson,
    updateProject,
    setRawJsonString,
    showBanner,
  } = useConfigManager();

  const {
    isOpen: isCredsOpen,
    isLoading: isCredsLoading,
    message: credsMessage,
    credentialRows,
    openDialog: openCredentialsDialog,
    closeDialog: closeCredentialsDialog,
    saveCredentials,
    clearCredential,
  } = useCredentialsManager();

  const {
    isOpen: isBrowserOpen,
    isLoading: isBrowserLoading,
    headlessConfigured,
    execPathConfigured,
    message: browserMessage,
    openDialog: openBrowserDialog,
    closeDialog: closeBrowserDialog,
    saveBrowserSettings,
    clearSetting: clearBrowserSetting,
  } = useBrowserSettings();

  const {
    runId,
    runStatus,
    logs,
    result,
    isTriggering,
    triggerRun,
  } = useRunPoller();


  // Initial load
  useEffect(() => {
    void loadConfigList();
  }, [loadConfigList]);

  // Transform projects for UI
  const projectsData: ProjectCardData[] = useMemo(() => {
    if (!currentDoc || !Array.isArray(currentDoc.projects)) {
      return [];
    }
    return currentDoc.projects.map((p) => ({
      id: p.id,
      name: p.name || p.id,
      loginUrl: p.loginUrl,
      jobUrl: p.jobUrl,
      runType: (p.runType as 'report' | 'auto-build') || 'report',
      waitForCompletion: (p.waitForCompletion ?? currentDoc.defaults?.waitForCompletion) !== false,
      waitTimeoutMs:
        typeof p.waitTimeoutMs === 'number'
          ? p.waitTimeoutMs
          : typeof currentDoc.defaults?.waitTimeoutMs === 'number'
          ? currentDoc.defaults.waitTimeoutMs
          : undefined,
      enabled: p.enabled !== false,
    }));
  }, [currentDoc]);

  // Handlers
  const handleToggleEnabled = (projectId: string, enabled: boolean) => {
    updateProject(projectId, { enabled });
  };

  const handleChangeRunType = (projectId: string, runType: 'report' | 'auto-build') => {
    updateProject(projectId, { runType });
  };

  const handleRunAutoBuild = async () => {
    if (activeConfigName && etag) {
      await triggerRun(activeConfigName, etag, 'auto-build');
    }
  };

  const handleRunReports = async () => {
    if (activeConfigName && etag) {
      await triggerRun(activeConfigName, etag, 'report');
    }
  };

  const handleSaveCredentials = async (secretsMap: Record<string, string>): Promise<boolean> => {
    const success = await saveCredentials(secretsMap);
    if (success) {
      showBanner('success', 'Credentials saved successfully.');
    }
    return success;
  };

  const handleSaveBrowserSettings = async (settings: BrowserSettingsInput): Promise<boolean> => {
    const success = await saveBrowserSettings(settings);
    if (success) {
      showBanner('success', 'Browser settings saved successfully.');
    }
    return success;
  };

  return (
    <DashboardLayout
      header={
        <HeaderBar
          configs={configList.map((c) => c.name)}
          activeConfig={activeConfigName}
          onSelectConfig={(name: string) => void loadConfig(name)}
          onReload={() => void reloadConfig()}
          onSave={() => void saveConfig()}
          onOpenCredentials={() => {
            if (currentDoc) {
              void openCredentialsDialog(currentDoc);
            }
          }}
          onOpenBrowserSettings={() => void openBrowserDialog()}
          isDirty={isDirty}
          isLoading={isConfigLoading}
        />
      }
      banner={
        <StatusBanner
          id="status-banner"
          variant={banner?.type || 'info'}
          message={banner?.message || ''}
          visible={Boolean(banner)}
        />
      }
      projectsSection={
        <ProjectsGrid
          projects={projectsData}
          isDirty={isDirty}
          onToggleEnabled={handleToggleEnabled}
          onChangeRunType={handleChangeRunType}
        />
      }
      formBuilderSection={
        <ConfigFormBuilder
          document={currentDoc}
          validationErrors={validationErrors}
          onAddProject={addProject}
          onUpdateProject={updateProjectAt}
          onRemoveProject={removeProjectAt}
          onUpdateDefaults={updateDefaults}
        />
      }
      rawJsonSection={
        <RawJsonSection
          rawJson={rawJsonString}
          validationStatus={jsonValidationMsg}
          onChange={setRawJsonString}
          onApply={() => applyRawJson()}
        />
      }
      actionsSection={
        <ExecutionSection
          isDirty={isDirty}
          isLoading={isTriggering || runStatus === 'running' || runStatus === 'queued'}
          onRunReports={() => void handleRunReports()}
          onRunAutoBuild={() => void handleRunAutoBuild()}
          reportWorkers={typeof currentDoc?.reportWorkers === 'number' ? currentDoc.reportWorkers : 1}
          hasDocument={Boolean(currentDoc)}
          onReportWorkersChange={updateReportWorkers}
        />
      }
      runSection={
        <RunStatusCard
          runId={runId}
          status={runStatus}
          logs={logs}
          result={result}
        />
      }
      dialogs={
        <>
          <CredentialsDialog
            isOpen={isCredsOpen}
            isLoading={isCredsLoading}
            message={credsMessage}
            credentialRows={credentialRows}
            onClose={closeCredentialsDialog}
            onSave={handleSaveCredentials}
            onClear={clearCredential}
          />

          <BrowserSettingsDialog
            isOpen={isBrowserOpen}
            isLoading={isBrowserLoading}
            headlessConfigured={headlessConfigured}
            execPathConfigured={execPathConfigured}
            message={browserMessage}
            onClose={closeBrowserDialog}
            onSave={handleSaveBrowserSettings}
            onClear={clearBrowserSetting}
          />
        </>
      }
    />
  );
}
