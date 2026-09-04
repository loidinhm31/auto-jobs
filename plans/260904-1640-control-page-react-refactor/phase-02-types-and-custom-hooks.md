# Phase 02: Core Types, Hooks & Interface Contracts

## Context Links
- Parent Plan: [plan.md](plan.md)
- Prior Phase: [phase-01-tooling-vite-pipeline-server-asset-routing.md](phase-01-tooling-vite-pipeline-server-asset-routing.md)
- Backend APIs: [report-server-control-api.ts](../../src/reporting/report-server-control-api.ts), [report-server-config-store.ts](../../src/reporting/report-server-config-store.ts), [config-types.ts](../../src/config/config-types.ts)
- Legacy JS Reference: [control-page.js](../../src/reporting/control-page/control-page.js)

## Parallelization Info
- Concurrency: Sequential after Phase 01. **Phase 03 can run in parallel** once Phase 01 is done, using the interface contracts defined here.
- Depends on: Phase 01
- Blocks: Phase 04

## Overview
- Date: 2026-09-04
- Description: Establish strict TypeScript contracts for dashboard state and UI component props, develop headless React hooks encapsulating CSRF tokens, REST communication, config caching with ETag headers, dirty state, credential management, browser settings, and run polling.
- Priority: P1
- Implementation Status: Pending
- Review Status: Pending

## Key Insights
1. **`useControlApi`**: CSRF token provided via `<meta name="csrf-token" content="...">`. All mutating HTTP requests (`POST`, `PUT`, `DELETE`) must send header `x-csrf-token`. The legacy `apiFetch()` wrapper auto-attaches this.
2. **`useConfigManager`**: Must track ETag from `GET /api/config` and provide `If-Match: etag` on `PUT /api/config`. Tracks `isDirty` when local modifications deviate from fetched config.
3. **`useRunPoller`**: Manages active run lifecycle. `POST /api/run` returns **`202 Accepted`** (not 200) with `{ id, status: "queued" }`. Polls `GET /api/run?id=<runId>` every 1,000ms. Status machine: `queued` → `running` → `succeeded` | `failed` | `submission-unknown`.
4. **Credentials and Browser Settings are separate workflows**: The legacy code has ~130 lines each of completely separate logic. Credentials use dynamically-discovered keys from the config document; browser settings use hardcoded keys (`PLAYWRIGHT_HEADLESS`, `PLAYWRIGHT_EXECUTABLE_PATH`).
5. **`discoverRequiredCredentialKeys()`**: Critical utility that scans `currentDoc.projects[*].credentials` and `currentDoc.defaults?.credentials` to extract `usernameVariable` / `passwordVariable` pairs, falling back to `JENKINS_USERNAME` / `JENKINS_PASSWORD`.
6. **API methods**: Secrets use `GET` (read presence), **`PUT`** (save — NOT POST), and `DELETE` (clear individual keys). There is no `POST /api/secrets` endpoint.

## Requirements

### Directory Structure
```
src/reporting/control-page/
├── types/
│   ├── index.ts              # Server data contracts
│   └── component-contracts.ts # Shared prop interfaces for Phase 03/04
├── hooks/
│   ├── useControlApi.ts
│   ├── useConfigManager.ts
│   ├── useCredentialsManager.ts   # Was useSecretsManager — split
│   ├── useBrowserSettings.ts      # Was useSecretsManager — split
│   └── useRunPoller.ts
└── utils/
    └── discoverCredentialKeys.ts
```

### Core Data Contracts (`types/index.ts`)
```ts
// --- Server response types ---
interface ConfigSummary { name: string; }
interface ConfigFileListResponse { configs: ConfigSummary[]; }
interface ConfigResponse { name: string; etag: string; document: ProjectConfigDocumentV1; }

interface ProjectConfigDocumentV1 {
  schemaVersion: 1;
  projects: ProjectConfigInput[];
  defaults?: ProjectConfigDefaults;
}

interface ProjectConfigInput {
  id: string;
  name: string;
  loginUrl: string;
  jobUrl: string;
  runType?: 'report' | 'auto-build';
  enabled?: boolean;
  credentials?: { usernameVariable: string; passwordVariable: string; };
  // ... other fields per config-types.ts
}

interface ProjectConfigDefaults {
  credentials?: { usernameVariable: string; passwordVariable: string; };
  // ... other fields per config-types.ts
}

// Run status: full state machine
type RunStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'submission-unknown';

interface RunLogEntry { timestamp: string; message: string; }
interface RunResult {
  reportUrl?: string;
  buildState?: string;
  jobUrl?: string;
  buildPageUrl?: string;
  error?: string;
}
interface RunRecord {
  id: string;
  status: RunStatus;
  logs: RunLogEntry[];
  result?: RunResult;
}
interface RunStatusResponse { run: RunRecord; }
interface RunTriggerResponse { id: string; status: 'queued'; }

// Secrets API: returns boolean presence map (never exposes values)
interface SecretsPresenceMap { secrets: Record<string, boolean>; }

// Browser settings: specific keys
type BrowserSettingKey = 'PLAYWRIGHT_HEADLESS' | 'PLAYWRIGHT_EXECUTABLE_PATH';
```

### Component Prop Contracts (`types/component-contracts.ts`)
> **Purpose**: Shared interfaces consumed by both Phase 02 hooks and Phase 03/04 components, enabling safe parallel development.

```ts
// Badge states used across the app
type BadgeVariant = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown'
                  | 'configured' | 'missing' | 'not-set';

// StatusBanner variants
type BannerVariant = 'info' | 'success' | 'error';

// Button variants
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline';

// Credential row data shape (from hook to component)
interface CredentialRowData {
  key: string;           // e.g. "JENKINS_PASSWORD"
  isConfigured: boolean; // from secrets presence map
}

// Browser setting row data shape
interface BrowserSettingData {
  key: BrowserSettingKey;
  isConfigured: boolean;
  currentValue?: string; // Only for display in select/input, not the secret value
}

// Project card data shape
interface ProjectCardData {
  id: string;
  name: string;
  loginUrl: string;
  jobUrl: string;
  runType: 'report' | 'auto-build';
  enabled: boolean;
  credentials?: { usernameVariable: string; passwordVariable: string; };
}
```

### Hook Specifications

#### `useControlApi` — Low-level API wrapper
- Extract CSRF token from `document.querySelector('meta[name="csrf-token"]')?.content` once at mount.
- Wrap `fetch()` to auto-attach `x-csrf-token` header on `POST`, `PUT`, `DELETE` methods.
- Handle status codes: `200`/`202` OK, `400` validation, `403` CSRF/origin, `409`/`412` ETag conflict, `415` media type, `422` schema error, `428` precondition required.
- Return typed JSON responses.

#### `useConfigManager` — Config CRUD & dirty state
- State: `configList`, `activeConfigName`, `currentDoc` (parsed JSON object), `rawJsonString` (for textarea), `etag`, `isDirty`, `statusMessage`.
- `loadConfigList()`: `GET /api/configs` → populate `configList`, auto-select first.
- `loadConfig(name)`: `GET /api/config?name=<name>` → store `name`, `etag`, `document`, reset `isDirty=false`.
- `saveConfig()`: `PUT /api/config?name=<name>` with `If-Match: <etag>`, `x-csrf-token`, `Content-Type: application/json`. Handle `409`/`412` conflict with user alert.
- `applyRawJson(jsonString)`: Parse, validate is plain object, update `currentDoc`, set `isDirty=true`.
- `updateProject(projectId, changes)`: Mutate project in `currentDoc`, sync `rawJsonString`, set `isDirty=true`.
- **Dirty state effects**: When `isDirty=true`, disable run buttons and auto-build triggers.

#### `useCredentialsManager` — Dynamic credential secrets (separated from browser settings)
- `discoverKeys(config)`: Call `discoverRequiredCredentialKeys(config)` to get list of credential variable keys.
- `loadStatus(keys)`: `GET /api/secrets?keys=<comma-joined>` → `SecretsPresenceMap`.
- `saveCredentials(entries)`: `PUT /api/secrets` with body `{ secrets: { key: value, ... } }`.
- `clearCredential(key)`: `DELETE /api/secrets?name=<key>`.
- State: `credentialRows: CredentialRowData[]`, `isLoading`, `message`, `isOpen`.
- **Security**: Clear all password input values from state on dialog close.

#### `useBrowserSettings` — Hardcoded browser config keys (separated from credentials)
- Fixed keys: `['PLAYWRIGHT_HEADLESS', 'PLAYWRIGHT_EXECUTABLE_PATH']`.
- `loadStatus()`: `GET /api/secrets?keys=PLAYWRIGHT_HEADLESS,PLAYWRIGHT_EXECUTABLE_PATH` → `SecretsPresenceMap`.
- `saveBrowserSettings(settings)`: `PUT /api/secrets` with body `{ secrets: { ... } }`.
- `clearSetting(key)`: `DELETE /api/secrets?name=<key>`.
- State: `headlessConfigured: boolean`, `execPathConfigured: boolean`, `isLoading`, `message`, `isOpen`.
- **Badge text**: Use `'Not Set'` (not `'Missing'`) for unconfigured browser settings. This differs from credentials which use `'Missing'`.

#### `useRunPoller` — Execution lifecycle
- `triggerRun(runType, projectId?)`: `POST /api/run` with body `{ configName, configEtag, runType, projectId? }`. **Expects `202 Accepted`** response with `{ id, status: "queued" }`.
- `startPolling(runId)`: `setInterval` at 1,000ms calling `GET /api/run?id=<runId>`.
- Status state machine: `idle` → `queued` → `running` → `succeeded` | `failed` | `submission-unknown`.
- State: `runStatus`, `runId`, `logs: RunLogEntry[]`, `result: RunResult | null`.
- **Cleanup**: Clear interval on unmount (`useEffect` cleanup), on terminal status, and on polling errors. Use `AbortController` for in-flight requests.
- **Exponential backoff**: On transient network errors during polling, apply backoff before retry.

### Utility: `discoverCredentialKeys(config)`
```ts
// Extracts unique credential variable keys from config document.
// Falls back to JENKINS_USERNAME / JENKINS_PASSWORD if no credentials declared.
function discoverRequiredCredentialKeys(doc: ProjectConfigDocumentV1): string[] {
  const keys = new Set<string>();
  for (const project of doc.projects) {
    if (project.credentials) {
      keys.add(project.credentials.usernameVariable);
      keys.add(project.credentials.passwordVariable);
    }
  }
  if (doc.defaults?.credentials) {
    keys.add(doc.defaults.credentials.usernameVariable);
    keys.add(doc.defaults.credentials.passwordVariable);
  }
  if (keys.size === 0) {
    keys.add('JENKINS_USERNAME');
    keys.add('JENKINS_PASSWORD');
  }
  return Array.from(keys).sort();
}
```

## Related Code Files
- `src/reporting/control-page/types/index.ts`
- `src/reporting/control-page/types/component-contracts.ts`
- `src/reporting/control-page/hooks/useControlApi.ts`
- `src/reporting/control-page/hooks/useConfigManager.ts`
- `src/reporting/control-page/hooks/useCredentialsManager.ts`
- `src/reporting/control-page/hooks/useBrowserSettings.ts`
- `src/reporting/control-page/hooks/useRunPoller.ts`
- `src/reporting/control-page/utils/discoverCredentialKeys.ts`

## File Ownership
- Exclusively owns `src/reporting/control-page/types/*`, `src/reporting/control-page/hooks/*`, and `src/reporting/control-page/utils/*`.

## Implementation Steps
1. Create `types/index.ts` declaring types matching server models exactly (cross-reference `config-types.ts` and API response shapes).
2. Create `types/component-contracts.ts` with shared prop interfaces for Phase 03/04 consumption.
3. Implement `utils/discoverCredentialKeys.ts` with the key discovery logic.
4. Implement `useControlApi` with CSRF meta extraction, JSON request/response error parsing, and proper status code handling.
5. Implement `useConfigManager` with ETag handling, dirty state detection, active config switching, and raw JSON sync.
6. Implement `useCredentialsManager` with dynamic key discovery, status querying, save/clear handlers, and password clearing on close.
7. Implement `useBrowserSettings` with hardcoded keys, `'Not Set'`/`'Configured'` state tracking, save/clear handlers.
8. Implement `useRunPoller` with `202` response handling, `queued`→`running`→terminal state machine, cleanup on unmount, 1s interval polling, and exponential backoff on transient errors.

## Todo List
- [ ] Define server data types in `types/index.ts`
- [ ] Define component prop contracts in `types/component-contracts.ts`
- [ ] Implement `utils/discoverCredentialKeys.ts`
- [ ] Implement `hooks/useControlApi.ts`
- [ ] Implement `hooks/useConfigManager.ts`
- [ ] Implement `hooks/useCredentialsManager.ts`
- [ ] Implement `hooks/useBrowserSettings.ts`
- [ ] Implement `hooks/useRunPoller.ts`

## Success Criteria
- Type checks pass with `npm run typecheck`.
- Hooks handle all HTTP error scenarios (e.g. `409`/`412` Conflict for ETag mismatch, `403` CSRF missing, `400` validation, `202` accepted for runs).
- `discoverRequiredCredentialKeys()` correctly extracts keys from all project configs with fallback to defaults.
- `useCredentialsManager` and `useBrowserSettings` are separate hooks with independent state.

## Conflict Prevention
- Fully isolated to types, hooks, and utils. Does not produce UI markup or alter build pipelines.
- `types/component-contracts.ts` serves as the **shared interface** between this phase and Phase 03, enabling safe parallel development.

## Risk Assessment
- **Risk**: Memory leaks or stale polling timers when switching configs or unmounting.
- **Mitigation**: Clean up `useEffect` interval timers and AbortControllers appropriately.
- **Risk**: Race condition between `useCredentialsManager` and `useBrowserSettings` both calling `/api/secrets`.
- **Mitigation**: These operate on disjoint key sets and the server handles concurrent reads safely.

## Security Considerations
- CSRF token must not be cached indefinitely if refreshed by server.
- Secret passwords in state must be cleared from inputs after submission and on dialog close.
- Never log or render secret values in the DOM (tests assert `page.content()` does not contain plaintext secrets).

## Next Steps
- Proceed to Phase 03: Atomic Design Components (Atoms & Molecules).
- Phase 03 can begin in parallel using `types/component-contracts.ts` as the shared interface.
