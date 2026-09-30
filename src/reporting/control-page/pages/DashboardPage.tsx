import { useEffect, useMemo } from 'react';
import { useConfigManager } from '../hooks/useConfigManager.js';
import { useCredentialsManager } from '../hooks/useCredentialsManager.js';
import { useBrowserSettings, type BrowserSettingsInput } from '../hooks/useBrowserSettings.js';
import { useRunPoller } from '../hooks/useRunPoller.js';
import { StatusBanner } from '../components/atoms/StatusBanner.js';
import { HeaderBar } from '../components/organisms/HeaderBar.js';
import { ProjectsJobMatrix } from '../components/organisms/projects-job-matrix.js';
import { RawJsonSection } from '../components/organisms/RawJsonSection.js';
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
    updateDefaults,
    updateReportWorkers,
    updateDocument,
    loadConfigList,
    loadConfig,
    reloadConfig,
    saveConfig,
    applyRawJson,
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

  const { runId, runStatus, logs, result, isTriggering, triggerRun } = useRunPoller();

  useEffect(() => {
    void loadConfigList();
  }, [loadConfigList]);

  const { executableTargetCount, skippedBlankCount } = useMemo(() => {
    if (!currentDoc || !Array.isArray(currentDoc.projects)) {
      return { executableTargetCount: 0, skippedBlankCount: 0 };
    }
    let executable = 0;
    let skipped = 0;
    for (const project of currentDoc.projects) {
      if (project.enabled === false) continue;
      const selections = project.selectedJobColumns ?? [];
      for (const colId of selections) {
        const url = project.jobs?.[colId]?.trim();
        if (url && url.length > 0) executable += 1;
        else skipped += 1;
      }
    }
    return { executableTargetCount: executable, skippedBlankCount: skipped };
  }, [currentDoc]);

  const handleRunAutoBuild = async () => {
    if (activeConfigName && etag && !isDirty && validationErrors.length === 0 && executableTargetCount > 0) {
      await triggerRun(activeConfigName, etag, 'auto-build');
    }
  };
  const handleRunReports = async () => {
    if (activeConfigName && etag && !isDirty && validationErrors.length === 0 && executableTargetCount > 0) {
      await triggerRun(activeConfigName, etag, 'report');
    }
  };
  const handleSaveCredentials = async (secretsMap: Record<string, string>): Promise<boolean> => {
    const success = await saveCredentials(secretsMap);
    if (success) showBanner('success', 'Credentials saved successfully.');
    return success;
  };
  const handleSaveBrowserSettings = async (settings: BrowserSettingsInput): Promise<boolean> => {
    const success = await saveBrowserSettings(settings);
    if (success) showBanner('success', 'Browser settings saved successfully.');
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
            if (currentDoc) void openCredentialsDialog(currentDoc);
          }}
          onOpenBrowserSettings={() => void openBrowserDialog()}
          isDirty={isDirty}
          isLoading={isConfigLoading}
          isInvalid={validationErrors.length > 0}
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
      matrixSection={
        <ProjectsJobMatrix
          document={currentDoc}
          validationErrors={validationErrors}
          disabled={isConfigLoading || !currentDoc}
          onUpdateDocument={updateDocument}
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
          isInvalid={validationErrors.length > 0}
          executableTargetCount={executableTargetCount}
          skippedBlankCount={skippedBlankCount}
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
