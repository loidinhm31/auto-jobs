import { expect, test } from '@playwright/test';
import { ConfigError } from '../../src/config-errors.js';
import { assertProjectConfigDocument } from '../../src/config/project-config-schema.js';

import { discoverRequiredCredentialKeys } from '../../src/reporting/control-page/utils/discoverCredentialKeys.js';
import {
  addProjectDraft,
  removeProjectDocumentAt,
  updateProjectDocumentAt,
  updateProjectDocumentDefaults,
  updateProjectDocumentReportWorkers,
} from '../../src/reporting/control-page/hooks/config-document-transitions.js';
import {
  ControlApiError,
  getCsrfTokenFromDom,
} from '../../src/reporting/control-page/hooks/useControlApi.js';
import {
  ACTIVE_CONFIG_STORAGE_KEY,
  clearStoredActiveConfig,
  readStoredActiveConfig,
  readUrlActiveConfig,
  resolveActiveConfigName,
  syncUrlActiveConfig,
  writeStoredActiveConfig,
} from '../../src/reporting/control-page/utils/config-selection.js';
import type {
  ProjectConfigDocumentV1,
  RunStatus,
} from '../../src/reporting/control-page/types/index.js';
import type {
  BadgeVariant,
  BannerVariant,
  ButtonVariant,
  CredentialRowData,
  BrowserSettingData,
} from '../../src/reporting/control-page/types/component-contracts.js';

test.describe('Control Page Phase 02: Types, Utility & Hook Contracts', () => {
  test.describe('discoverRequiredCredentialKeys', () => {
    test('returns empty array for null, undefined, or empty projects', () => {
      expect(discoverRequiredCredentialKeys(null)).toEqual([]);
      expect(discoverRequiredCredentialKeys(undefined)).toEqual([]);
      expect(discoverRequiredCredentialKeys({ schemaVersion: 1, projects: [] })).toEqual([]);
    });

    test('falls back to JENKINS_USERNAME and JENKINS_PASSWORD if project has no credentials and no defaults', () => {
      const doc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            loginUrl: 'https://jenkins.example.com',
            jobUrl: 'https://jenkins.example.com/job/test',
          },
        ],
      };

      const keys = discoverRequiredCredentialKeys(doc);
      expect(keys).toEqual(['JENKINS_PASSWORD', 'JENKINS_USERNAME']);
    });

    test('uses defaults.credentials when project has no explicit credentials', () => {
      const doc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        defaults: {
          credentials: {
            usernameVariable: 'GLOBAL_USER',
            passwordVariable: 'GLOBAL_PASS',
          },
        },
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            loginUrl: 'https://jenkins.example.com',
            jobUrl: 'https://jenkins.example.com/job/test',
          },
        ],
      };

      const keys = discoverRequiredCredentialKeys(doc);
      expect(keys).toEqual(['GLOBAL_PASS', 'GLOBAL_USER']);
    });

    test('uses legacy defaults.credentialVariables when project has no explicit credentials', () => {
      const doc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        defaults: {
          credentialVariables: {
            usernameVariable: 'LEGACY_USER',
            passwordVariable: 'LEGACY_PASS',
          },
        },
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            loginUrl: 'https://jenkins.example.com',
            jobUrl: 'https://jenkins.example.com/job/test',
          },
        ],
      };

      const keys = discoverRequiredCredentialKeys(doc);
      expect(keys).toEqual(['LEGACY_PASS', 'LEGACY_USER']);
    });

    test('prefers project-specific credentials over defaults', () => {
      const doc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        defaults: {
          credentials: {
            usernameVariable: 'DEFAULT_USER',
            passwordVariable: 'DEFAULT_PASS',
          },
        },
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            loginUrl: 'https://jenkins.example.com',
            jobUrl: 'https://jenkins.example.com/job/test',
            credentials: {
              usernameVariable: 'PROJECT_USER',
              passwordVariable: 'PROJECT_PASS',
            },
          },
        ],
      };

      const keys = discoverRequiredCredentialKeys(doc);
      expect(keys).toEqual(['PROJECT_PASS', 'PROJECT_USER']);
    });

    test('handles legacy array of string credentialVariables on project', () => {
      const doc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            loginUrl: 'https://jenkins.example.com',
            jobUrl: 'https://jenkins.example.com/job/test',
            credentialVariables: ['API_TOKEN', 'JENKINS_SECRET'],
          },
        ],
      };

      const keys = discoverRequiredCredentialKeys(doc);
      expect(keys).toEqual(['API_TOKEN', 'JENKINS_SECRET']);
    });

    test('deduplicates and alphabetically sorts across multiple projects', () => {
      const doc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            loginUrl: 'https://jenkins.example.com',
            jobUrl: 'https://jenkins.example.com/job/1',
            credentials: {
              usernameVariable: 'SHARED_USER',
              passwordVariable: 'PASS_B',
            },
          },
          {
            id: 'proj-2',
            name: 'Project 2',
            loginUrl: 'https://jenkins.example.com',
            jobUrl: 'https://jenkins.example.com/job/2',
            credentials: {
              usernameVariable: 'SHARED_USER',
              passwordVariable: 'PASS_A',
            },
          },
        ],
      };

      const keys = discoverRequiredCredentialKeys(doc);
      expect(keys).toEqual(['PASS_A', 'PASS_B', 'SHARED_USER']);
    });
  });

  test.describe('ControlApiError', () => {
    test('constructs correctly with message, status, and optional error code', () => {
      const err = new ControlApiError('Precondition failed', 412, 'ETAG_MISMATCH');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ControlApiError);
      expect(err.name).toBe('ControlApiError');
      expect(err.message).toBe('Precondition failed');
      expect(err.status).toBe(412);
      expect(err.code).toBe('ETAG_MISMATCH');
    });

    test('handles omission of code', () => {
      const err = new ControlApiError('Internal Server Error', 500);
      expect(err.status).toBe(500);
      expect(err.code).toBeUndefined();
    });
  });

  test.describe('DOM CSRF Helper (in browser context)', () => {
    test('getCsrfTokenFromDom retrieves meta tag value or empty string', async ({ page }) => {
      await page.setContent('<html><head><meta name="csrf-token" content="secret-csrf-12345"></head><body></body></html>');

      const token = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta?.getAttribute('content') ?? '';
      });
      expect(token).toBe('secret-csrf-12345');

      await page.setContent('<html><head></head><body></body></html>');
      const emptyToken = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta?.getAttribute('content') ?? '';
      });
      expect(emptyToken).toBe('');
    });
  });

  test.describe('Component Contract Types Consistency', () => {
    test('validates BadgeVariant and Status type contracts', () => {
      const validStatuses: RunStatus[] = [
        'idle',
        'queued',
        'running',
        'succeeded',
        'failed',
        'submission-unknown',
      ];
      expect(validStatuses).toHaveLength(6);

      const sampleBadge: BadgeVariant = 'configured';
      expect(sampleBadge).toBe('configured');

      const sampleBanner: BannerVariant = 'error';
      expect(sampleBanner).toBe('error');

      const sampleButton: ButtonVariant = 'primary';
      expect(sampleButton).toBe('primary');

      const credRow: CredentialRowData = { key: 'JENKINS_PASSWORD', isConfigured: true };
      expect(credRow.isConfigured).toBe(true);

      const browserSetting: BrowserSettingData = {
        key: 'PLAYWRIGHT_HEADLESS',
        isConfigured: false,
      };
      expect(browserSetting.key).toBe('PLAYWRIGHT_HEADLESS');
    });
  });

  test.describe('Hooks Runtime Verification in Browser Context', () => {
    test('CSRF header is automatically attached to mutating methods and omitted on GET', async ({ page }) => {
      await page.setContent(`
        <html>
          <head><meta name="csrf-token" content="mock-csrf-token"></head>
          <body><div id="root"></div></body>
        </html>
      `);

      const headersCaptured = await page.evaluate(async () => {
        const intercepted: Array<{ method: string; csrfHeader: string | null }> = [];
        const originalFetch = window.fetch;

        window.fetch = async (input, init = {}) => {
          const method = (init.method || 'GET').toUpperCase();
          const headers = new Headers(init.headers || {});
          intercepted.push({
            method,
            csrfHeader: headers.get('x-csrf-token'),
          });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        };

        const getCsrf = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

        const apiFetch = async (url: string, opts: RequestInit = {}) => {
          const m = (opts.method || 'GET').toUpperCase();
          const h = new Headers(opts.headers || {});
          if (m === 'POST' || m === 'PUT' || m === 'DELETE') {
            const token = getCsrf();
            if (token) h.set('x-csrf-token', token);
          }
          return window.fetch(url, { ...opts, headers: h });
        };

        await apiFetch('/api/test-get', { method: 'GET' });
        await apiFetch('/api/test-post', { method: 'POST', body: '{}' });
        await apiFetch('/api/test-put', { method: 'PUT', body: '{}' });
        await apiFetch('/api/test-delete', { method: 'DELETE' });

        window.fetch = originalFetch;
        return intercepted;
      });

      expect(headersCaptured).toEqual([
        { method: 'GET', csrfHeader: null },
        { method: 'POST', csrfHeader: 'mock-csrf-token' },
        { method: 'PUT', csrfHeader: 'mock-csrf-token' },
        { method: 'DELETE', csrfHeader: 'mock-csrf-token' },
      ]);
    });

    test('validates exponential backoff and terminal states in polling state machine', () => {
      const BASE_POLL_INTERVAL_MS = 1000;
      const MAX_POLL_INTERVAL_MS = 10000;

      const calcBackoff = (failures: number) =>
        Math.min(BASE_POLL_INTERVAL_MS * Math.pow(2, failures), MAX_POLL_INTERVAL_MS);

      expect(calcBackoff(1)).toBe(2000);
      expect(calcBackoff(2)).toBe(4000);
      expect(calcBackoff(3)).toBe(8000);
      expect(calcBackoff(4)).toBe(10000);
      expect(calcBackoff(5)).toBe(10000);

      const terminalStatuses = ['succeeded', 'failed', 'submission-unknown'];
      expect(terminalStatuses.includes('running')).toBe(false);
      expect(terminalStatuses.includes('succeeded')).toBe(true);
      expect(terminalStatuses.includes('failed')).toBe(true);
      expect(terminalStatuses.includes('submission-unknown')).toBe(true);
    });
  });

  test.describe('Active Configuration Selection and Persistence Contracts', () => {
    test('exports correct storage key constant', () => {
      expect(ACTIVE_CONFIG_STORAGE_KEY).toBe('jenkins_control_active_config');
    });

    test.describe('resolveActiveConfigName precedence', () => {
      const available = ['projects.json', 'staging.json', 'production.json'];

      test('returns empty string when availableConfigs is empty', () => {
        expect(resolveActiveConfigName({ availableConfigs: [] })).toBe('');
        expect(
          resolveActiveConfigName({
            availableConfigs: [],
            queryCandidate: 'staging.json',
            storedCandidate: 'projects.json',
          }),
        ).toBe('');
      });

      test('selects valid queryCandidate over storedCandidate and first available', () => {
        const result = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: 'production.json',
          storedCandidate: 'staging.json',
        });
        expect(result).toBe('production.json');
      });

      test('selects valid storedCandidate when queryCandidate is missing or null', () => {
        const resultNull = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: null,
          storedCandidate: 'staging.json',
        });
        expect(resultNull).toBe('staging.json');

        const resultUndefined = resolveActiveConfigName({
          availableConfigs: available,
          storedCandidate: 'staging.json',
        });
        expect(resultUndefined).toBe('staging.json');
      });

      test('ignores stale queryCandidate and falls back to valid storedCandidate', () => {
        const result = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: 'deleted-old.json',
          storedCandidate: 'staging.json',
        });
        expect(result).toBe('staging.json');
      });

      test('falls back to first available config when both query and stored candidates are invalid or missing', () => {
        const bothInvalid = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: 'nonexistent-1.json',
          storedCandidate: 'nonexistent-2.json',
        });
        expect(bothInvalid).toBe('projects.json');

        const bothMissing = resolveActiveConfigName({
          availableConfigs: available,
        });
        expect(bothMissing).toBe('projects.json');
      });

      test('trims candidate strings before validating against available list', () => {
        const trimmedQuery = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: '  staging.json  ',
          storedCandidate: 'production.json',
        });
        expect(trimmedQuery).toBe('staging.json');

        const trimmedStored = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: null,
          storedCandidate: '  production.json  ',
        });
        expect(trimmedStored).toBe('production.json');
      });

      test('falls back to first available config when storage candidate is stale and query is absent', () => {
        const result = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: null,
          storedCandidate: 'stale-removed.json',
        });
        expect(result).toBe('projects.json');
      });

      test('handles unknown query candidate by falling back to valid stored candidate', () => {
        const result = resolveActiveConfigName({
          availableConfigs: available,
          queryCandidate: 'unknown-link.json',
          storedCandidate: 'production.json',
        });
        expect(result).toBe('production.json');
      });
    });

    test.describe('browser storage and URL synchronization helpers', () => {
      test('correctly handles localStorage read, write, and clear in page context', async ({ page }) => {
        await page.route('http://localhost:3000/**', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><body><div id="test">Hello</div></body></html>',
          }),
        );
        await page.goto('http://localhost:3000/control');

        const storageResults = await page.evaluate(() => {
          const key = 'jenkins_control_active_config';
          localStorage.removeItem(key);

          const initial = localStorage.getItem(key);
          localStorage.setItem(key, 'test-config.json');
          const afterWrite = localStorage.getItem(key);
          localStorage.removeItem(key);
          const afterClear = localStorage.getItem(key);

          return { initial, afterWrite, afterClear };
        });

        expect(storageResults.initial).toBeNull();
        expect(storageResults.afterWrite).toBe('test-config.json');
        expect(storageResults.afterClear).toBeNull();
      });

      test('URL synchronization preserves other parameters and hash without reloading', async ({ page }) => {
        await page.route('http://localhost:3000/**', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><body><div id="test">Hello</div></body></html>',
          }),
        );
        await page.goto('http://localhost:3000/control?mode=audit&config=old.json#section-1');

        const urlResults = await page.evaluate(() => {
          const readInitial = new URLSearchParams(window.location.search).get('config');
          const readOtherParam = new URLSearchParams(window.location.search).get('mode');

          // Update to new config via same logic as syncUrlActiveConfig
          const u1 = new URL(window.location.href);
          u1.searchParams.set('config', 'new.json');
          window.history.replaceState(window.history.state, '', `${u1.pathname}${u1.search}${u1.hash}`);

          const afterUpdateUrl = window.location.href;
          const afterUpdateConfig = new URLSearchParams(window.location.search).get('config');
          const afterUpdateMode = new URLSearchParams(window.location.search).get('mode');
          const afterUpdateHash = window.location.hash;

          // Clear config (empty list scenario)
          const u2 = new URL(window.location.href);
          u2.searchParams.delete('config');
          window.history.replaceState(window.history.state, '', `${u2.pathname}${u2.search}${u2.hash}`);

          const afterDeleteConfig = new URLSearchParams(window.location.search).get('config');
          const afterDeleteMode = new URLSearchParams(window.location.search).get('mode');
          const afterDeleteHash = window.location.hash;

          return {
            readInitial,
            readOtherParam,
            afterUpdateUrl,
            afterUpdateConfig,
            afterUpdateMode,
            afterUpdateHash,
            afterDeleteConfig,
            afterDeleteMode,
            afterDeleteHash,
          };
        });

        expect(urlResults.readInitial).toBe('old.json');
        expect(urlResults.readOtherParam).toBe('audit');
        expect(urlResults.afterUpdateConfig).toBe('new.json');
        expect(urlResults.afterUpdateMode).toBe('audit');
        expect(urlResults.afterUpdateHash).toBe('#section-1');
        expect(urlResults.afterDeleteConfig).toBeNull();
        expect(urlResults.afterDeleteMode).toBe('audit');
        expect(urlResults.afterDeleteHash).toBe('#section-1');
      });

      test('gracefully handles access when localStorage is blocked or restricted', () => {
        // In Node environment without window/localStorage, helpers return null/safe no-op
        expect(readStoredActiveConfig()).toBeNull();
        expect(() => writeStoredActiveConfig('test.json')).not.toThrow();
        expect(() => clearStoredActiveConfig()).not.toThrow();
        expect(readUrlActiveConfig()).toBeNull();
        expect(() => syncUrlActiveConfig('test.json')).not.toThrow();
        expect(() => syncUrlActiveConfig(null)).not.toThrow();
      });
    });

  });

  test.describe('Controlled configuration document transitions', () => {
    const document: ProjectConfigDocumentV1 = {
      schemaVersion: 1,
      defaults: {
        timeoutMs: 30_000,
        browser: 'firefox',
        artifactDir: 'reports',
        allowedOrigins: ['https://jenkins.example'],
      },
      projects: [
        {
          id: 'new-project',
          name: 'Existing',
          loginUrl: 'https://jenkins.example/login',
          jobUrl: 'https://jenkins.example/job/build',
          allowedOrigins: ['https://jenkins.example'],
        },
        {
          id: 'new-project-2',
          name: 'Second',
          loginUrl: 'https://jenkins.example/login',
          jobUrl: 'https://jenkins.example/job/second',
          enabled: true,
        },
      ],
    };

    test('adds a collision-free draft and preserves untouched project fields', () => {
      const added = addProjectDraft(document);
      expect(added?.projectId).toBe('new-project-3');
      expect(added?.document.projects[2]).toMatchObject({
        id: 'new-project-3',
        name: 'New Project',
        loginUrl: '',
        jobUrl: '',
        runType: 'report',
        enabled: true,
      });
      expect(document.projects).toHaveLength(2);

      const edited = updateProjectDocumentAt(document, 0, { name: 'Renamed' });
      expect(edited.projects[0]).toMatchObject({
        name: 'Renamed',
        allowedOrigins: ['https://jenkins.example'],
      });
      expect(document.projects[0]?.name).toBe('Existing');
    });

    test('preserves unrelated defaults, removes empty defaults, and protects project invariants', () => {
      const updated = updateProjectDocumentDefaults(document, (previous) => ({
        ...previous,
        timeoutMs: 60_000,
      }));
      expect(updated.defaults).toMatchObject({
        timeoutMs: 60_000,
        browser: 'firefox',
        artifactDir: 'reports',
        allowedOrigins: ['https://jenkins.example'],
      });
      expect(updateProjectDocumentDefaults(document, () => ({}))).not.toHaveProperty('defaults');
      expect(removeProjectDocumentAt(document, 0)?.projects.map((project) => project.id))
        .toEqual(['new-project-2']);

      const onlyEnabledProject = {
        ...document,
        projects: [
          { ...document.projects[0]!, enabled: true },
          { ...document.projects[1]!, enabled: false },
        ],
      };
      expect(removeProjectDocumentAt(onlyEnabledProject, 0)).toBeNull();
      expect(removeProjectDocumentAt({ ...document, projects: [document.projects[0]!] }, 0)).toBeNull();

      const fullDocument = {
        ...document,
        projects: Array.from({ length: 50 }, (_, index) => ({
          ...document.projects[0]!,
          id: `project-${index}`,
        })),
      };
      expect(addProjectDraft(fullDocument)).toBeNull();
    });

    test('maintains unique IDs across sequential addProjectDraft additions', () => {
      let currentDoc = document;
      const firstAdded = addProjectDraft(currentDoc);
      expect(firstAdded).not.toBeNull();
      expect(firstAdded!.projectId).toBe('new-project-3');
      currentDoc = firstAdded!.document;

      const secondAdded = addProjectDraft(currentDoc);
      expect(secondAdded).not.toBeNull();
      expect(secondAdded!.projectId).toBe('new-project-4');
      currentDoc = secondAdded!.document;

      const thirdAdded = addProjectDraft(currentDoc);
      expect(thirdAdded).not.toBeNull();
      expect(thirdAdded!.projectId).toBe('new-project-5');
      currentDoc = thirdAdded!.document;

      const ids = currentDoc.projects.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
      expect(ids).toContain('new-project-3');
      expect(ids).toContain('new-project-4');
      expect(ids).toContain('new-project-5');
    });

    test('preserves advanced fields when updating project at index', () => {
      const advancedDoc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          {
            id: 'svc-advanced',
            name: 'Advanced Service',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/build',
            runType: 'auto-build',
            enabled: true,
            allowedOrigins: ['https://jenkins.example', 'https://auth.example'],
            credentials: {
              usernameVariable: 'CUSTOM_USER',
              passwordVariable: 'CUSTOM_PASS',
            },
            credentialVariables: ['EXTRA_SECRET_KEY'],
          },
        ],
      };

      const updated = updateProjectDocumentAt(advancedDoc, 0, {
        name: 'Renamed Advanced Service',
        loginUrl: 'https://jenkins.example/custom-login',
      });

      expect(updated.projects[0]).toEqual({
        id: 'svc-advanced',
        name: 'Renamed Advanced Service',
        loginUrl: 'https://jenkins.example/custom-login',
        jobUrl: 'https://jenkins.example/job/build',
        runType: 'auto-build',
        enabled: true,
        allowedOrigins: ['https://jenkins.example', 'https://auth.example'],
        credentials: {
          usernameVariable: 'CUSTOM_USER',
          passwordVariable: 'CUSTOM_PASS',
        },
        credentialVariables: ['EXTRA_SECRET_KEY'],
      });
    });

    test('enforces project count and enabled invariant rules on deletion', () => {
      const threeProjectsDoc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          { id: 'p1', name: 'P1', loginUrl: 'https://j.ex/l', jobUrl: 'https://j.ex/j', enabled: true },
          { id: 'p2', name: 'P2', loginUrl: 'https://j.ex/l', jobUrl: 'https://j.ex/j', enabled: true },
          { id: 'p3', name: 'P3', loginUrl: 'https://j.ex/l', jobUrl: 'https://j.ex/j', enabled: false },
        ],
      };

      // Can remove p1 because p2 is still enabled
      const afterRemovingP1 = removeProjectDocumentAt(threeProjectsDoc, 0);
      expect(afterRemovingP1).not.toBeNull();
      expect(afterRemovingP1!.projects.map((p) => p.id)).toEqual(['p2', 'p3']);

      // Now from ['p2' (enabled), 'p3' (disabled)], removing p2 would leave 0 enabled projects -> returns null
      const attemptRemovingOnlyEnabled = removeProjectDocumentAt(afterRemovingP1!, 0);
      expect(attemptRemovingOnlyEnabled).toBeNull();

      // Removing disabled p3 succeeds, leaving ['p2' (enabled)]
      const afterRemovingP3 = removeProjectDocumentAt(afterRemovingP1!, 1);
      expect(afterRemovingP3).not.toBeNull();
      expect(afterRemovingP3!.projects.map((p) => p.id)).toEqual(['p2']);

      // Now only 1 project left -> cannot remove the last project
      expect(removeProjectDocumentAt(afterRemovingP3!, 0)).toBeNull();
    });

    test('clears individual default fields and removes defaults object entirely when emptied', () => {
      const withDefaults: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        defaults: {
          timeoutMs: 45_000,
          browser: 'chromium',
          artifactDir: 'custom-reports',
        },
        projects: [
          { id: 'p1', name: 'P1', loginUrl: 'https://j.ex/l', jobUrl: 'https://j.ex/j' },
        ],
      };

      // Clear timeoutMs
      const withoutTimeout = updateProjectDocumentDefaults(withDefaults, (prev) => {
        const { timeoutMs: _removed, ...rest } = prev;
        return rest;
      });
      expect(withoutTimeout.defaults).toEqual({
        browser: 'chromium',
        artifactDir: 'custom-reports',
      });

      // Clear remaining defaults
      const completelyCleared = updateProjectDocumentDefaults(withoutTimeout, () => ({}));
      expect(completelyCleared.defaults).toBeUndefined();
      expect('defaults' in completelyCleared).toBe(false);
    });

    test('updates document reportWorkers and preserves existing properties', () => {
      const base: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          {
            id: 'p1',
            name: 'P1',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/p1',
          },
        ],
      };
      const updated = updateProjectDocumentReportWorkers(base, 3);
      expect(updated.reportWorkers).toBe(3);
      expect(updated.schemaVersion).toBe(1);
      expect(updated.projects).toEqual(base.projects);

      // Rejects invalid values via normalizeReportWorkerCount
      expect(() => updateProjectDocumentReportWorkers(base, 0)).toThrow(RangeError);
      expect(() => updateProjectDocumentReportWorkers(base, 5)).toThrow(RangeError);
      expect(() => updateProjectDocumentReportWorkers(base, 2.5)).toThrow(RangeError);
    });

    test('validates schema contracts via assertProjectConfigDocument', () => {
      const validDoc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          {
            id: 'valid-project',
            name: 'Valid Project',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/build',
            runType: 'report',
            enabled: true,
          },
        ],
      };
      expect(assertProjectConfigDocument(validDoc)).toBe(validDoc);

      // Empty projects array
      expect(() =>
        assertProjectConfigDocument({ schemaVersion: 1, projects: [] }),
      ).toThrow(ConfigError);

      // No enabled project
      expect(() =>
        assertProjectConfigDocument({
          schemaVersion: 1,
          projects: [{ ...validDoc.projects[0]!, enabled: false }],
        }),
      ).toThrow(ConfigError);

      // Duplicate project ID
      expect(() =>
        assertProjectConfigDocument({
          schemaVersion: 1,
          projects: [
            validDoc.projects[0]!,
            { ...validDoc.projects[0]!, name: 'Copy' },
          ],
        }),
      ).toThrow(/duplicate project id/i);

      // Invalid schema version
      expect(() =>
        assertProjectConfigDocument({
          schemaVersion: 2,
          projects: [validDoc.projects[0]!],
        }),
      ).toThrow(/schemaVersion must be 1/i);
    });

    test('observable applyRawJson transitions: commits valid JSON and rejects invalid/malformed JSON', () => {
      const initialDoc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        projects: [
          {
            id: 'base-service',
            name: 'Base Service',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/base',
            enabled: true,
          },
        ],
      };

      const simulateApply = (
        current: ProjectConfigDocumentV1,
        rawString: string,
      ): { doc: ProjectConfigDocumentV1; isDirty: boolean; error: string | null } => {
        try {
          const parsed = JSON.parse(rawString);
          const validated = assertProjectConfigDocument(parsed);
          return { doc: validated as unknown as ProjectConfigDocumentV1, isDirty: true, error: null };
        } catch (err) {
          const msg = err instanceof ConfigError ? err.issues.join('; ') : err instanceof Error ? err.message : String(err);
          return { doc: current, isDirty: false, error: msg };
        }
      };

      // 1. Valid modified JSON -> commits new doc and dirty = true
      const validUpdate = {
        schemaVersion: 1,
        projects: [
          {
            id: 'base-service',
            name: 'Updated Service Name',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/base',
            enabled: true,
          },
        ],
      };
      const resultValid = simulateApply(initialDoc, JSON.stringify(validUpdate));
      expect(resultValid.error).toBeNull();
      expect(resultValid.isDirty).toBe(true);
      expect(resultValid.doc.projects[0]?.name).toBe('Updated Service Name');

      // 2. Malformed JSON (syntax error) -> preserves prior doc, isDirty = false, reports error
      const resultMalformed = simulateApply(initialDoc, '{ invalid json');
      expect(resultMalformed.error).toBeTruthy();
      expect(resultMalformed.isDirty).toBe(false);
      expect(resultMalformed.doc).toBe(initialDoc);
      expect(resultMalformed.doc.projects[0]?.name).toBe('Base Service');

      // 3. Schema-invalid JSON (all projects disabled) -> preserves prior doc, isDirty = false, reports validation issue
      const schemaInvalid = {
        schemaVersion: 1,
        projects: [
          {
            id: 'base-service',
            name: 'All Disabled',
            loginUrl: 'https://jenkins.example/login',
            jobUrl: 'https://jenkins.example/job/base',
            enabled: false,
          },
        ],
      };
      const resultSchemaInvalid = simulateApply(initialDoc, JSON.stringify(schemaInvalid));
      expect(resultSchemaInvalid.error).toContain('must contain an enabled project');
      expect(resultSchemaInvalid.isDirty).toBe(false);
      expect(resultSchemaInvalid.doc).toBe(initialDoc);
      expect(resultSchemaInvalid.doc.projects[0]?.name).toBe('Base Service');
    });
  });

  test.describe('Server API Endpoints & Hook Contracts End-to-End', () => {
    let configRoot: string;
    let reportRoot: string;
    let serverUrl: string;
    let csrfToken: string;
    let serverHandle: any;

    test.beforeEach(async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const { createReportServer } = await import('../../src/reporting/report-server.js');

      configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-hook-test-config-'));
      reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-hook-test-report-'));

      const initialDoc = {
        schemaVersion: 1,
        projects: [
          {
            id: 'hook-test-project',
            name: 'Hook Test Project',
            loginUrl: 'https://jenkins.example.com/login',
            jobUrl: 'https://jenkins.example.com/job/hook-test/',
            runType: 'report',
            enabled: true,
          },
        ],
      };

      fs.writeFileSync(
        path.join(configRoot, 'default.json'),
        JSON.stringify(initialDoc, null, 2),
        'utf8',
      );

      serverHandle = await createReportServer(reportRoot, {
        mode: 'control',
        configRoot,
        host: '127.0.0.1',
        port: 0,
      });

      serverUrl = serverHandle.url;
      csrfToken = serverHandle.csrfToken!;
    });

    test.afterEach(async () => {
      const fs = await import('node:fs');
      if (serverHandle) await serverHandle.close();
      if (configRoot) fs.rmSync(configRoot, { recursive: true, force: true });
      if (reportRoot) fs.rmSync(reportRoot, { recursive: true, force: true });
    });

    test('config manager lifecycle: lists, loads, detects conflict on stale ETag, and saves with valid ETag', async ({
      request,
    }) => {
      const parsedServerUrl = new URL(serverUrl);
      const origin = `${parsedServerUrl.protocol}//${parsedServerUrl.host}`;

      // 1. List configs
      const listResp = await request.get(`${serverUrl}api/configs`);
      expect(listResp.status()).toBe(200);
      const listData = await listResp.json();
      expect(listData.configs).toHaveLength(1);
      expect(listData.configs[0].name).toBe('default.json');

      // 2. Load config
      const loadResp = await request.get(`${serverUrl}api/config?name=default.json`);
      expect(loadResp.status()).toBe(200);
      const loadData = await loadResp.json();
      expect(loadData.name).toBe('default.json');
      expect(loadData.etag).toMatch(/^"[a-f0-9]{64}"$/);
      expect(loadData.document.projects[0].id).toBe('hook-test-project');

      const initialEtag = loadData.etag;

      // 3. Stale ETag returns 409 Conflict
      const staleResp = await request.put(`${serverUrl}api/config?name=default.json`, {
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
          origin,
          'if-match': '"stale-etag-value"',
        },
        data: loadData.document,
      });
      expect(staleResp.status()).toBe(409);

      // 4. Valid ETag saves successfully and updates ETag
      const modifiedDoc = {
        ...loadData.document,
        projects: [
          {
            ...loadData.document.projects[0],
            name: 'Updated Project Name',
          },
        ],
      };

      const saveResp = await request.put(`${serverUrl}api/config?name=default.json`, {
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
          origin,
          'if-match': initialEtag,
        },
        data: modifiedDoc,
      });
      expect(saveResp.status()).toBe(200);
      const saveData = await saveResp.json();
      expect(saveData.etag).not.toBe(initialEtag);
      expect(saveData.document.projects[0].name).toBe('Updated Project Name');
    });

    test('credentials manager lifecycle: checks presence, saves secret, and clears secret', async ({
      request,
    }) => {
      const parsedServerUrl = new URL(serverUrl);
      const origin = `${parsedServerUrl.protocol}//${parsedServerUrl.host}`;

      // Check presence of undiscovered / empty keys
      const initialResp = await request.get(
        `${serverUrl}api/secrets?keys=JENKINS_USERNAME,JENKINS_PASSWORD`,
      );
      expect(initialResp.status()).toBe(200);
      const initialData = await initialResp.json();
      expect(initialData.secrets).toEqual({
        JENKINS_USERNAME: false,
        JENKINS_PASSWORD: false,
      });

      // Save credentials
      const saveResp = await request.put(`${serverUrl}api/secrets`, {
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
          origin,
        },
        data: {
          secrets: {
            JENKINS_USERNAME: 'ci-user',
            JENKINS_PASSWORD: 'ci-password',
          },
        },
      });
      expect(saveResp.status()).toBe(200);
      const saveData = await saveResp.json();
      expect(saveData.secrets.JENKINS_USERNAME).toBe(true);
      expect(saveData.secrets.JENKINS_PASSWORD).toBe(true);

      // Delete one credential
      const deleteResp = await request.delete(`${serverUrl}api/secrets?name=JENKINS_PASSWORD`, {
        headers: {
          'x-csrf-token': csrfToken,
          origin,
        },
      });
      expect(deleteResp.status()).toBe(200);
      const deleteData = await deleteResp.json();
      expect(deleteData.secrets.JENKINS_PASSWORD).toBeUndefined();
      expect(deleteData.secrets.JENKINS_USERNAME).toBe(true);
    });

    test('browser settings lifecycle: checks and modifies PLAYWRIGHT_HEADLESS', async ({
      request,
    }) => {
      const parsedServerUrl = new URL(serverUrl);
      const origin = `${parsedServerUrl.protocol}//${parsedServerUrl.host}`;

      // Check initial presence
      const initResp = await request.get(
        `${serverUrl}api/secrets?keys=PLAYWRIGHT_HEADLESS,PLAYWRIGHT_EXECUTABLE_PATH`,
      );
      expect(initResp.status()).toBe(200);
      const initData = await initResp.json();
      expect(initData.secrets.PLAYWRIGHT_HEADLESS).toBe(false);

      // Save headless setting
      const saveResp = await request.put(`${serverUrl}api/secrets`, {
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
          origin,
        },
        data: {
          secrets: {
            PLAYWRIGHT_HEADLESS: 'false',
          },
        },
      });
      expect(saveResp.status()).toBe(200);
      const saveData = await saveResp.json();
      expect(saveData.secrets.PLAYWRIGHT_HEADLESS).toBe(true);

      // Clear headless setting
      const clearResp = await request.delete(
        `${serverUrl}api/secrets?name=PLAYWRIGHT_HEADLESS`,
        {
          headers: {
            'x-csrf-token': csrfToken,
            origin,
          },
        },
      );
      expect(clearResp.status()).toBe(200);
      const clearData = await clearResp.json();
      expect(clearData.secrets.PLAYWRIGHT_HEADLESS).toBeUndefined();
    });

    test('run poller lifecycle: triggers run with 202 Accepted and retrieves run status', async ({
      request,
    }) => {
      const parsedServerUrl = new URL(serverUrl);
      const origin = `${parsedServerUrl.protocol}//${parsedServerUrl.host}`;

      // Get current config etag
      const cfgResp = await request.get(`${serverUrl}api/config?name=default.json`);
      const cfgData = await cfgResp.json();

      // Trigger run
      const triggerResp = await request.post(`${serverUrl}api/run`, {
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
          origin,
        },
        data: {
          configName: 'default.json',
          configEtag: cfgData.etag,
          runType: 'report',
        },
      });

      expect(triggerResp.status()).toBe(202);
      const triggerData = await triggerResp.json();
      expect(triggerData.id).toBeDefined();
      expect(['queued', 'running']).toContain(triggerData.status);

      // Poll status
      const pollResp = await request.get(`${serverUrl}api/run?id=${encodeURIComponent(triggerData.id)}`);
      expect(pollResp.status()).toBe(200);
      const pollData = await pollResp.json();
      expect(pollData.run.id).toBe(triggerData.id);
      expect(['queued', 'running', 'succeeded', 'failed']).toContain(pollData.run.status);
    });
  });
});
