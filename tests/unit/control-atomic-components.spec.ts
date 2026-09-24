import { expect, test } from '@playwright/test';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  Badge,
  Button,
  Input,
  Select,
  StatusBanner,
  LoadingIndicator,
} from '../../src/reporting/control-page/components/atoms/index.js';
import {
  CredentialRow,
  BrowserSettingRow,
  ConfigSelectorBar,
  LogViewer,
  RunResultBox,
} from '../../src/reporting/control-page/components/molecules/index.js';
import { ExecutionSection } from '../../src/reporting/control-page/components/organisms/ExecutionSection.js';

test.describe('Phase 03: Atomic Design Components (Atoms & Molecules)', () => {
  test.describe('Atoms', () => {
    test.describe('Badge', () => {
      test('renders variant classes strictly adhering to contract', () => {
        const idleHtml = renderToString(React.createElement(Badge, { variant: 'idle' }));
        expect(idleHtml).toContain('class="badge badge-idle"');
        expect(idleHtml).toContain('Idle');

        const queuedHtml = renderToString(React.createElement(Badge, { variant: 'queued' }));
        expect(queuedHtml).toContain('class="badge badge-queued"');
        expect(queuedHtml).toContain('Queued');

        const runningHtml = renderToString(React.createElement(Badge, { variant: 'running' }));
        expect(runningHtml).toContain('class="badge badge-running"');
        expect(runningHtml).toContain('Running');

        const succeededHtml = renderToString(React.createElement(Badge, { variant: 'succeeded' }));
        expect(succeededHtml).toContain('class="badge badge-succeeded"');
        expect(succeededHtml).toContain('Succeeded');

        const failedHtml = renderToString(React.createElement(Badge, { variant: 'failed' }));
        expect(failedHtml).toContain('class="badge badge-failed"');
        expect(failedHtml).toContain('Failed');

        const unknownHtml = renderToString(React.createElement(Badge, { variant: 'unknown' }));
        expect(unknownHtml).toContain('class="badge badge-unknown"');
        expect(unknownHtml).toContain('Unknown');

        const submissionUnknownHtml = renderToString(
          React.createElement(Badge, { variant: 'submission-unknown' }),
        );
        expect(submissionUnknownHtml).toContain('class="badge badge-unknown"');
        expect(submissionUnknownHtml).toContain('Unknown');
      });

      test('renders credential states: Configured and Missing', () => {
        const configuredHtml = renderToString(
          React.createElement(Badge, { variant: 'configured' }),
        );
        expect(configuredHtml).toContain('class="badge badge-configured"');
        expect(configuredHtml).toContain('Configured');

        const missingHtml = renderToString(
          React.createElement(Badge, { variant: 'missing' }),
        );
        expect(missingHtml).toContain('class="badge badge-missing"');
        expect(missingHtml).toContain('Missing');
      });

      test('renders browser setting state: "Not Set" with badge-missing class', () => {
        const notSetHtml = renderToString(
          React.createElement(Badge, {
            id: 'badge-browser-headless',
            variant: 'not-set',
          }),
        );
        expect(notSetHtml).toContain('id="badge-browser-headless"');
        expect(notSetHtml).toContain('class="badge badge-missing"');
        expect(notSetHtml).toContain('Not Set');
      });

      test('supports custom children and id attribute', () => {
        const customHtml = renderToString(
          React.createElement(
            Badge,
            { id: 'run-status-badge', variant: 'running' },
            'running',
          ),
        );
        expect(customHtml).toContain('id="run-status-badge"');
        expect(customHtml).toContain('running');
      });
    });

    test.describe('Button', () => {
      test('renders variant classes and default button type', () => {
        const primaryHtml = renderToString(
          React.createElement(Button, { variant: 'primary' }, 'Submit'),
        );
        expect(primaryHtml).toContain('class="btn btn-primary"');
        expect(primaryHtml).toContain('type="button"');
        expect(primaryHtml).toContain('Submit');

        const secondaryHtml = renderToString(
          React.createElement(Button, { variant: 'secondary' }, 'Cancel'),
        );
        expect(secondaryHtml).toContain('class="btn btn-secondary"');

        const dangerHtml = renderToString(
          React.createElement(Button, { variant: 'danger' }, 'Delete'),
        );
        expect(dangerHtml).toContain('class="btn btn-danger"');

        const outlineHtml = renderToString(
          React.createElement(Button, { variant: 'outline' }, 'Options'),
        );
        expect(outlineHtml).toContain('class="btn btn-outline"');
      });

      test('renders size sm and disabled state', () => {
        const smDisabledHtml = renderToString(
          React.createElement(
            Button,
            { variant: 'secondary', size: 'sm', disabled: true },
            'Clear',
          ),
        );
        expect(smDisabledHtml).toContain('btn-sm');
        expect(smDisabledHtml).toContain('disabled=""');
      });
    });

    test.describe('Input', () => {
      test('renders credential-input with password type and autocomplete off', () => {
        const inputHtml = renderToString(
          React.createElement(Input, {
            id: 'secret-input-JENKINS_PASSWORD',
            type: 'password',
            autoComplete: 'off',
            className: 'credential-input',
          }),
        );
        expect(inputHtml).toContain('id="secret-input-JENKINS_PASSWORD"');
        expect(inputHtml).toContain('type="password"');
        expect(inputHtml).toMatch(/autocomplete="off"/i);
        expect(inputHtml).toContain('credential-input');
      });

      test('associates label via htmlFor and displays error with role alert', () => {
        const fieldHtml = renderToString(
          React.createElement(Input, {
            id: 'test-field',
            label: 'Test Field',
            error: 'Value is required',
          }),
        );
        expect(fieldHtml).toContain('for="test-field"');
        expect(fieldHtml).toContain('Test Field');
        expect(fieldHtml).toContain('role="alert"');
        expect(fieldHtml).toContain('Value is required');
        expect(fieldHtml).toContain('aria-invalid="true"');
      });
    });

    test.describe('Select', () => {
      test('renders native select with options and aria-label', () => {
        const selectHtml = renderToString(
          React.createElement(Select, {
            id: 'config-select',
            ariaLabel: 'Select Configuration',
            options: [
              { value: 'default.json', label: 'default.json' },
              { value: 'staging.json', label: 'staging.json' },
            ],
          }),
        );
        expect(selectHtml).toContain('id="config-select"');
        expect(selectHtml).toContain('aria-label="Select Configuration"');
        expect(selectHtml).toContain('value="default.json"');
        expect(selectHtml).toContain('default.json');
        expect(selectHtml).toContain('value="staging.json"');
      });
    });

    test.describe('StatusBanner', () => {
      test('renders role="status", aria-live="polite", and hidden toggle', () => {
        const bannerHtml = renderToString(
          React.createElement(StatusBanner, {
            id: 'status-banner',
            variant: 'success',
            message: 'Configuration saved successfully',
            visible: true,
          }),
        );
        expect(bannerHtml).toContain('id="status-banner"');
        expect(bannerHtml).toContain('role="status"');
        expect(bannerHtml).toContain('aria-live="polite"');
        expect(bannerHtml).toContain('class="status-banner success"');
        expect(bannerHtml).toContain('Configuration saved successfully');
        expect(bannerHtml).not.toContain('hidden');

        const hiddenBannerHtml = renderToString(
          React.createElement(StatusBanner, {
            id: 'status-banner',
            variant: 'info',
            message: 'Hidden message',
            visible: false,
          }),
        );
        expect(hiddenBannerHtml).toContain('hidden');
      });
    });

    test.describe('LoadingIndicator', () => {
      test('renders aria-live polite and hidden toggle', () => {
        const loadingHtml = renderToString(
          React.createElement(LoadingIndicator, {
            id: 'credentials-loading',
            message: 'Loading credentials...',
            visible: true,
          }),
        );
        expect(loadingHtml).toContain('id="credentials-loading"');
        expect(loadingHtml).toContain('aria-live="polite"');
        expect(loadingHtml).toContain('credentials-loading');
        expect(loadingHtml).toContain('Loading credentials...');
        expect(loadingHtml).not.toContain('hidden');

        const hiddenHtml = renderToString(
          React.createElement(LoadingIndicator, {
            id: 'browser-loading',
            visible: false,
          }),
        );
        expect(hiddenHtml).toContain('hidden');
      });
    });
  });

  test.describe('Molecules', () => {
    test.describe('CredentialRow', () => {
      test('renders exact contract DOM structure for unconfigured credential', () => {
        const rowHtml = renderToString(
          React.createElement(CredentialRow, {
            secretKey: 'JENKINS_PASSWORD',
            isConfigured: false,
          }),
        );

        // Class .credential-row wrapper
        expect(rowHtml).toContain('class="credential-row"');
        // Label with dynamic ID
        expect(rowHtml).toContain('for="secret-input-JENKINS_PASSWORD"');
        expect(rowHtml).toContain('JENKINS_PASSWORD');
        // Badge Missing
        expect(rowHtml).toContain('class="badge badge-missing"');
        expect(rowHtml).toContain('Missing');
        // Input password with id and credential-input class
        expect(rowHtml).toContain('id="secret-input-JENKINS_PASSWORD"');
        expect(rowHtml).toContain('type="password"');
        expect(rowHtml).toContain('class="credential-input"');
        expect(rowHtml).toMatch(/autocomplete="off"/i);
        // Clear button should not be present when not configured
        expect(rowHtml).not.toContain('btn-clear-credential');
      });

      test('renders Configured badge and clear button with data-key for configured credential', () => {
        const rowHtml = renderToString(
          React.createElement(CredentialRow, {
            secretKey: 'JENKINS_USERNAME',
            isConfigured: true,
          }),
        );

        expect(rowHtml).toContain('class="badge badge-configured"');
        expect(rowHtml).toContain('Configured');
        // Clear button with exact data-key attribute and classes
        expect(rowHtml).toContain('class="btn btn-secondary btn-sm btn-clear-credential"');
        expect(rowHtml).toContain('data-key="JENKINS_USERNAME"');
        expect(rowHtml).toContain('Clear');
      });
    });

    test.describe('BrowserSettingRow', () => {
      test('renders PLAYWRIGHT_HEADLESS with exact contract badge and clear button IDs', () => {
        const unconfiguredHtml = renderToString(
          React.createElement(BrowserSettingRow, {
            settingKey: 'PLAYWRIGHT_HEADLESS',
            isConfigured: false,
          }),
        );

        expect(unconfiguredHtml).toContain('id="badge-browser-headless"');
        expect(unconfiguredHtml).toContain('class="badge badge-missing"');
        expect(unconfiguredHtml).toContain('Not Set');
        expect(unconfiguredHtml).toContain('id="browser-headless-select"');
        expect(unconfiguredHtml).toContain('id="btn-clear-browser-headless"');
        expect(unconfiguredHtml).toContain('hidden');

        const configuredHtml = renderToString(
          React.createElement(BrowserSettingRow, {
            settingKey: 'PLAYWRIGHT_HEADLESS',
            isConfigured: true,
          }),
        );

        expect(configuredHtml).toContain('class="badge badge-configured"');
        expect(configuredHtml).toContain('Configured');
        expect(configuredHtml).not.toContain('btn-clear-browser-headless" class="btn btn-secondary btn-sm btn-clear-credential hidden"');
      });

      test('renders PLAYWRIGHT_EXECUTABLE_PATH with exact contract badge and clear button IDs', () => {
        const unconfiguredHtml = renderToString(
          React.createElement(BrowserSettingRow, {
            settingKey: 'PLAYWRIGHT_EXECUTABLE_PATH',
            isConfigured: false,
          }),
        );

        expect(unconfiguredHtml).toContain('id="badge-browser-executable-path"');
        expect(unconfiguredHtml).toContain('Not Set');
        expect(unconfiguredHtml).toContain('id="browser-executable-path-input"');
        expect(unconfiguredHtml).toContain('id="btn-clear-browser-executable-path"');
        expect(unconfiguredHtml).toContain('hidden');

        const configuredHtml = renderToString(
          React.createElement(BrowserSettingRow, {
            settingKey: 'PLAYWRIGHT_EXECUTABLE_PATH',
            isConfigured: true,
          }),
        );

        expect(configuredHtml).toContain('id="badge-browser-executable-path"');
        expect(configuredHtml).toContain('Configured');
      });
    });

    test.describe('ConfigSelectorBar', () => {
      test('renders contract element IDs and respects isDirty state on save button', () => {
        const notDirtyHtml = renderToString(
          React.createElement(ConfigSelectorBar, {
            configs: ['default.json', 'demo.json'],
            activeConfig: 'default.json',
            isDirty: false,
            onSelectConfig: () => {},
            onReload: () => {},
            onSave: () => {},
            onOpenCredentials: () => {},
            onOpenBrowserSettings: () => {},
          }),
        );

        expect(notDirtyHtml).toContain('id="config-select"');
        expect(notDirtyHtml).toContain('aria-label="Select Configuration"');
        expect(notDirtyHtml).toContain('id="btn-reload"');
        expect(notDirtyHtml).toContain('id="btn-save"');
        expect(notDirtyHtml).toContain('disabled=""'); // save button disabled when not dirty
        expect(notDirtyHtml).toContain('id="btn-credentials"');
        expect(notDirtyHtml).toContain('id="btn-browser-settings"');

        const dirtyHtml = renderToString(
          React.createElement(ConfigSelectorBar, {
            configs: ['default.json'],
            activeConfig: 'default.json',
            isDirty: true,
            onSelectConfig: () => {},
            onReload: () => {},
            onSave: () => {},
            onOpenCredentials: () => {},
            onOpenBrowserSettings: () => {},
          }),
        );

        // Check that Save button is not disabled when isDirty is true
        const saveButtonMatch = dirtyHtml.match(/<button[^>]*id="btn-save"[^>]*>/);
        expect(saveButtonMatch).toBeDefined();
        expect(saveButtonMatch![0]).not.toContain('disabled');
      });
    });

    test.describe('LogViewer', () => {
      test('renders pre element with id="run-logs", role="log", and aria-live="polite"', () => {
        const emptyHtml = renderToString(
          React.createElement(LogViewer, { logs: [] }),
        );
        expect(emptyHtml).toContain('id="run-logs"');
        expect(emptyHtml).toContain('role="log"');
        expect(emptyHtml).toContain('aria-live="polite"');
        expect(emptyHtml).toContain('class="log-pre"');
        expect(emptyHtml).toContain('No active run.');

        const stringLogsHtml = renderToString(
          React.createElement(LogViewer, {
            logs: 'Report run finished with status: succeeded',
          }),
        );
        expect(stringLogsHtml).toContain('Report run finished with status: succeeded');

        const arrayLogsHtml = renderToString(
          React.createElement(LogViewer, {
            logs: [
              { timestamp: '12:00:01', message: 'Starting job' },
              { timestamp: '12:00:05', message: 'Report run finished' },
            ],
          }),
        );
        expect(arrayLogsHtml).toContain('[12:00:01] Starting job');
        expect(arrayLogsHtml).toContain('[12:00:05] Report run finished');
      });
    });

    test.describe('RunResultBox', () => {
      test('renders link containing /reports/ when reportUrl is present', () => {
        const reportResultHtml = renderToString(
          React.createElement(RunResultBox, {
            result: {
              reportUrl: '/reports/demo-service/run-1/index.html',
            },
          }),
        );

        expect(reportResultHtml).toContain('id="run-result-box"');
        expect(reportResultHtml).toContain('class="run-result-box"');
        expect(reportResultHtml).toContain('href="/reports/demo-service/run-1/index.html"');
        expect(reportResultHtml).toContain('Open Generated Report');
        expect(reportResultHtml).not.toContain('hidden');
      });

      test('renders Jenkins build link when buildPageUrl is present', () => {
        const buildResultHtml = renderToString(
          React.createElement(RunResultBox, {
            result: {
              buildPageUrl: 'https://jenkins.example.com/job/demo/10/build',
            },
          }),
        );

        expect(buildResultHtml).toContain('href="https://jenkins.example.com/job/demo/10/build"');
        expect(buildResultHtml).toContain('Open Jenkins Build');
      });

      test('renders both report link and error message when both are present', () => {
        const mixedResultHtml = renderToString(
          React.createElement(RunResultBox, {
            result: {
              reportUrl: '/reports/demo-service/run-1/index.html',
              error: 'Partial failure during archive step',
            },
          }),
        );

        expect(mixedResultHtml).toContain('Open Generated Report');
        expect(mixedResultHtml).toContain('Error: Partial failure during archive step');
      });

      test('is hidden when result is null', () => {
        const hiddenHtml = renderToString(
          React.createElement(RunResultBox, { result: null }),
        );
        expect(hiddenHtml).toContain('id="run-result-box"');
        expect(hiddenHtml).toContain('hidden');
      });
      test('renders multiple buildProjects in config order with badges, build links, stages, and errors', () => {
        const batchHtml = renderToString(
          React.createElement(RunResultBox, {
            result: {
              buildProjects: [
                {
                  projectId: 'proj-alpha',
                  projectName: 'Alpha Service',
                  state: 'succeeded',
                  buildResult: 'SUCCESS',
                  exitCode: 0,
                  buildNumber: '42',
                  buildPageUrl: 'https://jenkins.example.com/job/alpha/42',
                  jobUrl: 'https://jenkins.example.com/job/alpha',
                  stages: [
                    { index: 1, name: 'Build', status: 'SUCCESS', duration: '12s' },
                    { index: 2, name: 'Test', status: 'SUCCESS', duration: '45s' },
                  ],
                },
                {
                  projectId: 'proj-beta',
                  projectName: 'Beta Service',
                  state: 'failed',
                  buildResult: 'FAILURE',
                  exitCode: 1,
                  buildNumber: '10',
                  buildPageUrl: 'https://jenkins.example.com/job/beta/10',
                  jobUrl: 'https://jenkins.example.com/job/beta',
                  error: 'Compilation error in step 2',
                  stages: [
                    { index: 1, name: 'Build', status: 'FAILED', duration: '5s' },
                  ],
                },
                {
                  projectId: 'proj-gamma',
                  projectName: 'Gamma Service',
                  state: 'submission-unknown',
                  exitCode: 1,
                  jobUrl: '',
                  error: 'Socket timeout before Jenkins handshake',
                },
              ],
            },
          }),
        );

        expect(batchHtml).toContain('id="run-result-box"');
        expect(batchHtml).not.toContain('hidden');
        expect(batchHtml).toContain('Alpha Service');
        expect(batchHtml).toContain('(proj-alpha)');
        expect(batchHtml).toContain('SUCCESS');
        expect(batchHtml).toContain('bg-emerald-100');
        expect(batchHtml).toContain('Build #42');
        expect(batchHtml).toContain('href="https://jenkins.example.com/job/alpha/42"');
        expect(batchHtml).toContain('Build: SUCCESS (12s)');
        expect(batchHtml).toContain('Test: SUCCESS (45s)');
        expect(batchHtml).toContain('Beta Service');
        expect(batchHtml).toContain('FAILURE');
        expect(batchHtml).toContain('bg-red-100');
        expect(batchHtml).toContain('Build #10');
        expect(batchHtml).toContain('Error: Compilation error in step 2');
        expect(batchHtml).toContain('Gamma Service');
        expect(batchHtml).toContain('submission-unknown');
        expect(batchHtml).toContain('Error: Socket timeout before Jenkins handshake');
        expect(batchHtml).not.toContain('href=""');
        const alphaPos = batchHtml.indexOf('Alpha Service');
        const betaPos = batchHtml.indexOf('Beta Service');
        const gammaPos = batchHtml.indexOf('Gamma Service');
        expect(alphaPos).toBeLessThan(betaPos);
        expect(betaPos).toBeLessThan(gammaPos);
      });
    });
    test.describe('ExecutionSection', () => {
      test('renders Generate Reports and Trigger Auto Build buttons and Workers select with options 1-4', () => {
        const html = renderToString(
          React.createElement(ExecutionSection, {
            onRunReports: () => {},
            onRunAutoBuild: () => {},
            reportWorkers: 1,
            hasDocument: true,
          }),
        );
        expect(html).toContain('id="btn-run-reports"');
        expect(html).toContain('Generate Reports (All Enabled)');
        expect(html).toContain('id="btn-run-auto-build"');
        expect(html).toContain('Trigger Auto Build (All Enabled)');
        expect(html).toContain('id="select-workers"');
        expect(html).toContain('Workers');
        expect(html).toContain('value="1"');
        expect(html).toContain('value="2"');
        expect(html).toContain('value="3"');
        expect(html).toContain('value="4"');
      });

      test('disables selector when hasDocument is false or isLoading is true', () => {
        const noDocHtml = renderToString(
          React.createElement(ExecutionSection, {
            onRunReports: () => {},
            onRunAutoBuild: () => {},
            hasDocument: false,
          }),
        );
        expect(noDocHtml).toMatch(/id="select-workers"[^>]*disabled/);

        const loadingHtml = renderToString(
          React.createElement(ExecutionSection, {
            onRunReports: () => {},
            onRunAutoBuild: () => {},
            hasDocument: true,
            isLoading: true,
          }),
        );
        expect(loadingHtml).toMatch(/id="select-workers"[^>]*disabled/);
      });

      test('disables both run buttons when isDirty, isLoading, or hasDocument is false', () => {
        const dirtyHtml = renderToString(
          React.createElement(ExecutionSection, {
            onRunReports: () => {},
            onRunAutoBuild: () => {},
            isDirty: true,
            hasDocument: true,
          }),
        );
        expect(dirtyHtml).toMatch(/id="btn-run-reports"[^>]*disabled/);
        expect(dirtyHtml).toMatch(/id="btn-run-auto-build"[^>]*disabled/);

        const loadingHtml = renderToString(
          React.createElement(ExecutionSection, {
            onRunReports: () => {},
            onRunAutoBuild: () => {},
            isLoading: true,
            hasDocument: true,
          }),
        );
        expect(loadingHtml).toMatch(/id="btn-run-reports"[^>]*disabled/);
        expect(loadingHtml).toMatch(/id="btn-run-auto-build"[^>]*disabled/);

        const noDocHtml = renderToString(
          React.createElement(ExecutionSection, {
            onRunReports: () => {},
            onRunAutoBuild: () => {},
            hasDocument: false,
          }),
        );
        expect(noDocHtml).toMatch(/id="btn-run-reports"[^>]*disabled/);
        expect(noDocHtml).toMatch(/id="btn-run-auto-build"[^>]*disabled/);
      });
    });
  });
});
