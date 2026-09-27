import { expect, test } from '@playwright/test';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  Badge,
  Button,
  Input,
  Select,
  Checkbox,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  IconButton,
  StatusBanner,
  LoadingIndicator,
} from '../../src/reporting/control-page/components/atoms/index.js';
import {
  FormField,
  PageHeader,
  CredentialRow,
  BrowserSettingRow,
  ConfigSelectorBar,
  LogViewer,
  RunResultBox,
} from '../../src/reporting/control-page/components/molecules/index.js';
import { ExecutionSection } from '../../src/reporting/control-page/components/organisms/ExecutionSection.js';
import {
  DashboardLayout,
  ReportManagementLayout,
  FinalReportLayout,
} from '../../src/reporting/control-page/components/templates/index.js';
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
      test('supports dot indicator variant', () => {
        const dotHtml = renderToString(
          React.createElement(Badge, { variant: 'running', dot: true }, 'In Progress'),
        );
        expect(dotHtml).toContain('class="badge badge-running"');
        expect(dotHtml).toContain('rounded-full');
        expect(dotHtml).toContain('In Progress');
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
        const ghostHtml = renderToString(
          React.createElement(Button, { variant: 'ghost' }, 'Dismiss'),
        );
        expect(ghostHtml).toContain('class="btn btn-ghost"');
        expect(ghostHtml).toContain('Dismiss');
      });

      test('supports asChild polymorphism via Radix Slot', () => {
        const linkButtonHtml = renderToString(
          React.createElement(
            Button,
            { asChild: true, variant: 'primary' },
            React.createElement('a', { href: '/dashboard' }, 'Dashboard Link'),
          ),
        );
        expect(linkButtonHtml).toContain('href="/dashboard"');
        expect(linkButtonHtml).toContain('class="btn btn-primary"');
        expect(linkButtonHtml).toContain('Dashboard Link');
        expect(linkButtonHtml).not.toContain('<button');
      });

      test('supports asChild with loading state without crashing Radix Slot', () => {
        const loadingSlotHtml = renderToString(
          React.createElement(
            Button,
            { asChild: true, loading: true },
            React.createElement('a', { href: '/reports' }, 'Reports'),
          ),
        );
        expect(loadingSlotHtml).toContain('href="/reports"');
        expect(loadingSlotHtml).toContain('aria-disabled="true"');
        expect(loadingSlotHtml).toContain('aria-busy="true"');
        expect(loadingSlotHtml).toContain('Reports');
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

      test('merges baseClasses with custom className like w-full', () => {
        const customInputHtml = renderToString(
          React.createElement(Input, {
            id: 'custom-input',
            className: 'w-full custom-focus',
          }),
        );
        expect(customInputHtml).toContain('id="custom-input"');
        expect(customInputHtml).toContain('border-slate-300');
        expect(customInputHtml).toContain('w-full');
        expect(customInputHtml).toContain('custom-focus');
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

      test('renders role="alert" and aria-live="assertive" for error variant', () => {
        const errorBannerHtml = renderToString(
          React.createElement(StatusBanner, {
            id: 'error-banner',
            variant: 'error',
            message: 'Failed to save configuration',
            visible: true,
          }),
        );
        expect(errorBannerHtml).toContain('role="alert"');
        expect(errorBannerHtml).toContain('aria-live="assertive"');
        expect(errorBannerHtml).toContain('status-banner error');
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
        expect(loadingHtml).toContain('role="status"');
        expect(loadingHtml).toContain('aria-live="polite"');
        expect(loadingHtml).toContain('credentials-loading');
        expect(loadingHtml).toContain('loading-indicator');
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

    test.describe('Checkbox', () => {
      test('renders standalone checkbox with id and effective aria-label', () => {
        const checkboxHtml = renderToString(
          React.createElement(Checkbox, {
            id: 'standalone-checkbox',
            ariaLabel: 'Enable option',
          }),
        );
        expect(checkboxHtml).toContain('id="standalone-checkbox"');
        expect(checkboxHtml).toContain('type="checkbox"');
        expect(checkboxHtml).toContain('aria-label="Enable option"');
        expect(checkboxHtml).toContain('accent-sky-600');
      });

      test('associates label via htmlFor and handles disabled state', () => {
        const labeledHtml = renderToString(
          React.createElement(Checkbox, {
            id: 'checkbox-enabled-proj1',
            label: 'Enable Project',
            disabled: true,
          }),
        );
        expect(labeledHtml).toContain('id="checkbox-enabled-proj1"');
        expect(labeledHtml).toContain('for="checkbox-enabled-proj1"');
        expect(labeledHtml).toContain('Enable Project');
        expect(labeledHtml).toContain('disabled=""');
      });
    });

    test.describe('Card', () => {
      test('renders compound Card structure with semantic elements', () => {
        const cardHtml = renderToString(
          React.createElement(
            Card,
            { id: 'test-card' },
            React.createElement(
              CardHeader,
              null,
              React.createElement(CardTitle, null, 'Project Alpha'),
              React.createElement(CardDescription, null, 'Active pipeline configuration'),
            ),
            React.createElement(CardContent, null, 'Card body content'),
            React.createElement(CardFooter, null, 'Card footer action'),
          ),
        );
        expect(cardHtml).toContain('id="test-card"');
        expect(cardHtml).toContain('card');
        expect(cardHtml).toContain('card-header');
        expect(cardHtml).toContain('<h3');
        expect(cardHtml).toContain('Project Alpha');
        expect(cardHtml).toContain('Active pipeline configuration');
        expect(cardHtml).toContain('Card body content');
        expect(cardHtml).toContain('Card footer action');
      });

      test('supports asChild polymorphism on Card container', () => {
        const sectionCardHtml = renderToString(
          React.createElement(
            Card,
            { asChild: true },
            React.createElement('section', { 'aria-label': 'Metrics panel' }, 'Metrics Content'),
          ),
        );
        expect(sectionCardHtml).toContain('<section');
        expect(sectionCardHtml).toContain('aria-label="Metrics panel"');
        expect(sectionCardHtml).toContain('card');
      });
    });

    test.describe('IconButton', () => {
      test('renders button with accessible name, title, and btn-icon styling', () => {
        const iconButtonHtml = renderToString(
          React.createElement(
            IconButton,
            {
              id: 'btn-copy-logs',
              ariaLabel: 'Copy logs to clipboard',
              variant: 'ghost',
              size: 'sm',
            },
            React.createElement('span', { className: 'lucide-copy' }),
          ),
        );
        expect(iconButtonHtml).toContain('id="btn-copy-logs"');
        expect(iconButtonHtml).toContain('aria-label="Copy logs to clipboard"');
        expect(iconButtonHtml).toContain('title="Copy logs to clipboard"');
        expect(iconButtonHtml).toContain('btn-icon');
        expect(iconButtonHtml).toContain('btn-ghost');
        expect(iconButtonHtml).toContain('btn-sm');
      });

      test('provides fallback accessible name if neither aria-label nor title is given', () => {
        const fallbackHtml = renderToString(
          React.createElement(IconButton, { id: 'btn-generic' }),
        );
        expect(fallbackHtml).toContain('aria-label="Action"');
        expect(fallbackHtml).toContain('title="Action"');
      });

      test('renders centered spinner replacing icon and sets aria-busy on loading', () => {
        const loadingIconHtml = renderToString(
          React.createElement(
            IconButton,
            {
              id: 'btn-reload-icon',
              ariaLabel: 'Reload config',
              loading: true,
            },
            React.createElement('span', { className: 'lucide-refresh' }),
          ),
        );
        expect(loadingIconHtml).toContain('aria-busy="true"');
        expect(loadingIconHtml).toContain('animate-spin');
        expect(loadingIconHtml).not.toContain('lucide-refresh');
      });
    });
  });

  test.describe('Molecules', () => {
    test.describe('FormField', () => {
      test('renders label with htmlFor matching field id and child element', () => {
        const html = renderToString(
          React.createElement(
            FormField,
            { id: 'user-field', label: 'Username' },
            React.createElement('input', { id: 'user-field', type: 'text' }),
          ),
        );
        expect(html).toContain('for="user-field"');
        expect(html).toContain('Username');
        expect(html).toContain('id="user-field"');
        expect(html).toContain('form-field');
      });

      test('renders required indicator when required is true', () => {
        const html = renderToString(
          React.createElement(
            FormField,
            { id: 'email-field', label: 'Email', required: true },
            React.createElement('input', { id: 'email-field', type: 'email' }),
          ),
        );
        expect(html).toContain('*');
        expect(html).toContain('(required)');
      });

      test('renders error with role="alert" and id error suffix', () => {
        const html = renderToString(
          React.createElement(
            FormField,
            {
              id: 'password-field',
              label: 'Password',
              error: 'Password must be at least 8 characters',
            },
            React.createElement('input', { id: 'password-field', type: 'password' }),
          ),
        );
        expect(html).toContain('id="password-field-error"');
        expect(html).toContain('role="alert"');
        expect(html).toContain('Password must be at least 8 characters');
      });

      test('renders helper text when provided and suppresses helper text when error is present', () => {
        const withHelper = renderToString(
          React.createElement(
            FormField,
            {
              id: 'host-field',
              label: 'Host',
              helperText: 'Enter hostname or IP address',
            },
            React.createElement('input', { id: 'host-field' }),
          ),
        );
        expect(withHelper).toContain('id="host-field-helper"');
        expect(withHelper).toContain('Enter hostname or IP address');

        const withBoth = renderToString(
          React.createElement(
            FormField,
            {
              id: 'host-field',
              label: 'Host',
              helperText: 'Enter hostname or IP address',
              error: 'Invalid hostname format',
            },
            React.createElement('input', { id: 'host-field' }),
          ),
        );
        expect(withBoth).toContain('id="host-field-error"');
        expect(withBoth).toContain('Invalid hostname format');
        expect(withBoth).not.toContain('Enter hostname or IP address');
      });
    });

    test.describe('PageHeader', () => {
      test('renders title with default h1 and custom h2 level', () => {
        const h1Html = renderToString(
          React.createElement(PageHeader, {
            title: 'Control Dashboard',
          }),
        );
        expect(h1Html).toContain('<h1');
        expect(h1Html).toContain('Control Dashboard');

        const h2Html = renderToString(
          React.createElement(PageHeader, {
            title: 'Reports Overview',
            level: 2,
          }),
        );
        expect(h2Html).toContain('<h2');
        expect(h2Html).toContain('Reports Overview');
      });

      test('renders back link with icon, label, and href', () => {
        const html = renderToString(
          React.createElement(PageHeader, {
            title: 'Project Details',
            backLink: {
              id: 'back-link',
              href: '/reports',
              label: 'Back to Reports',
            },
          }),
        );
        expect(html).toContain('id="back-link"');
        expect(html).toContain('href="/reports"');
        expect(html).toContain('Back to Reports');
      });

      test('renders subtitle and action slot', () => {
        const html = renderToString(
          React.createElement(PageHeader, {
            title: 'Settings',
            subtitle: 'Manage system-wide configuration',
            actions: React.createElement('button', { id: 'btn-export' }, 'Export'),
          }),
        );
        expect(html).toContain('Manage system-wide configuration');
        expect(html).toContain('id="btn-export"');
        expect(html).toContain('Export');
      });
    });

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

  test.describe('Templates', () => {
    test.describe('DashboardLayout', () => {
      test('renders standard slots, skip link, and 1200px container', () => {
        const html = renderToString(
          React.createElement(DashboardLayout, {
            header: React.createElement('header', { id: 'test-header' }, 'Header Content'),
            banner: React.createElement('div', { id: 'test-banner' }, 'Banner Message'),
            projectsSection: React.createElement('div', { id: 'test-projects' }, 'Projects Board'),
            formBuilderSection: React.createElement('div', { id: 'test-form' }, 'Form Builder'),
            rawJsonSection: React.createElement('div', { id: 'test-json' }, 'Raw JSON'),
            actionsSection: React.createElement('div', { id: 'test-actions' }, 'Actions Bar'),
            runSection: React.createElement('div', { id: 'test-run' }, 'Run Status'),
            dialogs: React.createElement('div', { id: 'test-dialogs' }, 'Dialog Overlays'),
          }),
        );

        expect(html).toContain('href="#main-content"');
        expect(html).toContain('class="skip-link"');
        expect(html).toContain('id="main-content"');
        expect(html).toContain('max-w-[1200px]');
        expect(html).toContain('id="test-header"');
        expect(html).toContain('id="test-banner"');
        expect(html).toContain('id="test-projects"');
        expect(html).toContain('id="test-form"');
        expect(html).toContain('id="test-json"');
        expect(html).toContain('id="test-actions"');
        expect(html).toContain('id="test-run"');
        expect(html).toContain('id="test-dialogs"');
      });
    });

    test.describe('ReportManagementLayout', () => {
      test('renders standard slots, skip link, and 1200px container', () => {
        const html = renderToString(
          React.createElement(ReportManagementLayout, {
            header: React.createElement('header', { id: 'report-header' }, 'Index Header'),
            banner: React.createElement('div', { id: 'feedback-banner' }, 'Feedback'),
            content: React.createElement('div', { id: 'report-content' }, 'Reports List'),
            dialogs: React.createElement('div', { id: 'delete-dialogs' }, 'Delete Modals'),
          }),
        );

        expect(html).toContain('href="#main-content"');
        expect(html).toContain('id="main-content"');
        expect(html).toContain('max-w-[1200px]');
        expect(html).toContain('id="report-header"');
        expect(html).toContain('id="feedback-banner"');
        expect(html).toContain('id="report-content"');
        expect(html).toContain('id="delete-dialogs"');
      });
    });

    test.describe('FinalReportLayout', () => {
      test('renders skip link, toolbar, export action, status view, and report content', () => {
        const html = renderToString(
          React.createElement(FinalReportLayout, {
            toolbar: React.createElement('nav', { id: 'report-breadcrumbs' }, 'Breadcrumbs'),
            exportAction: React.createElement('button', { id: 'btn-export' }, 'Export PDF'),
            statusView: React.createElement('div', { id: 'status-view' }, 'Loading...'),
            reportContent: React.createElement('div', { id: 'project-report-surface' }, 'Report Body'),
          }),
        );

        expect(html).toContain('href="#project-report-surface"');
        expect(html).toContain('class="control-report-bar');
        expect(html).toContain('max-w-[1200px]');
        expect(html).toContain('id="report-breadcrumbs"');
        expect(html).toContain('id="btn-export"');
        expect(html).toContain('id="status-view"');
        expect(html).toContain('id="project-report-surface"');
      });
    });
  });
});
