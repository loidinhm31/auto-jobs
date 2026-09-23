# Phase 01 — Active Configuration Persistence

## Context Links
- [Preflight report](../reports/scout-260923-0837-control-active-config-form-builder.md)
- [Config manager hook](../../src/reporting/control-page/hooks/useConfigManager.ts)
- [Config selector UI](../../src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx)
- [Control page unit contracts](../../tests/unit/control-hooks-and-types.spec.ts)
- [Code standards](../../docs/code-standards.md)

## Overview
**Priority:** P2 · **Status:** Complete / 100% · **Completed:** `2026-09-23T09:28:48+07:00` · **Estimate:** 1.5h. Restore the operator's active configuration across refreshes and direct links without changing server APIs or storing configuration contents.

## Key Insights
- `loadConfigList()` currently selects `configs[0]` unconditionally; `loadConfig(name)` loads the selected document and is already the `#config-select` path through `DashboardPage`.
- `/api/configs` returns the authoritative available names. A saved/query name must be checked against that list before calling `/api/config?name=...`.
- `setActiveConfigName` is returned from the hook but has no caller outside the hook; allowing it to bypass `loadConfig` would bypass persistence. Remove that unused setter from the public hook result after rechecking callsites during implementation.

## Requirements
- Use localStorage key `jenkins_control_active_config`; persist the selected filename only after a successful config load.
- On initial list load, resolve in this order: valid `?config=...`, valid stored filename, then first available config. Ignore stale/unknown names; if no configs exist, clear active state and stale selection.
- On user selection, update the same key and set the `config` search parameter with `URLSearchParams`/`history.replaceState`; retain pathname, unrelated parameters, and hash without reload.
- Storage/history access failures must not prevent a valid config from loading. Do not store JSON, credentials, ETags, or other config fields.
- Leave GET/PUT endpoints, CSRF handling, save behavior, and `If-Match` semantics unchanged.

## Architecture
`loadConfigList` obtains names, reads the URL and local preference, resolves only names in the fetched list, then calls the existing `loadConfig`. After a successful response, that function remains the single state transition for active name/document and synchronizes URL + storage. Put the pure name-resolution rule in a small `src/reporting/control-page/utils/config-selection.ts` helper so it can be tested without `window`; keep browser effects at the hook boundary. No initialization-time access to `window` at module scope.

## Related Code Files
- Modify `src/reporting/control-page/hooks/useConfigManager.ts` — restore preferred name, persist successful selection, remove unused public direct setter.
- Create `src/reporting/control-page/utils/config-selection.ts` — pure valid-name precedence helper.
- Modify `tests/unit/control-hooks-and-types.spec.ts` — behavior tests for valid URL precedence, localStorage fallback, stale entries, and empty list.
- Later integration: `src/reporting/control-page/pages/DashboardPage.tsx` selection handler remains routed through `loadConfig`.

## Implementation Steps
1. Add the fixed storage-key constant and pure resolver taking config names, query candidate, and stored candidate. Return a candidate only when it exists in the list; otherwise return the first name or empty.
2. Update `loadConfigList` to read query/storage safely after `/api/configs` resolves, select the resolver result, and avoid the current unconditional-first reset.
3. On successful `loadConfig`, synchronize the selected filename to localStorage and URL. Use `URL`/`searchParams.set('config', name)` and `replaceState`; do not overwrite unrelated URL state. Remove stale selection when the list is empty.
4. Keep failed loads non-destructive: show the existing error banner and do not persist an unavailable or failed selection.
5. Remove the hook's unused direct active-name setter so all selected-name transitions pass through `loadConfig`.
6. Add focused contract cases to `control-hooks-and-types.spec.ts`; integrated browser reload and deep-link checks belong to phase 4.

## Todo List
- [x] Add config-name resolution with query > stored > first precedence.
- [x] Persist selection after a successful load and preserve the rest of the URL.
- [x] Handle stale names, zero configs, and unavailable storage without breaking selection.
- [x] Cover resolution/fallback behavior in the named unit spec.

## Success Criteria
- Initial load selects a valid deep link over a different stored value; absent/invalid deep link restores a valid stored value; stale values fall back to the first available config.
- Selecting another config updates localStorage and `?config=` without page navigation; pathname/hash/other params remain intact.
- Config load/save API shapes and ETag behavior are unchanged; all existing selector IDs remain present.

## Preflight Contract
- Allowed persistence data is one config filename in localStorage and query state only; no config or secret content.
- Only names returned by `GET /api/configs` may be restored or requested. API methods and routes stay unchanged.

## Side-Effect Review Checklist
- [x] Query synchronization uses `replaceState`, not navigation or a server request.
- [x] Selection persistence occurs after successful load; no stale/failed name is written.
- [x] Empty config list clears only the active selection, not config files or credentials.
- [x] No writes occur to the config document until the existing Save action.

## Risk Assessment
- **Stale browser preference:** validate against the fetched list and fall back deterministically.
- **Query/storage disagreement:** a valid explicit URL is an intentional deep link and wins; invalid URL values do not suppress a valid saved selection.
- **Storage blocked or history rejected:** guard browser effects and keep in-memory selection usable.
- **Race during first load:** select only after list response; avoid issuing both first-config and restored-config requests.

## Security Considerations
- Treat URL and localStorage values as untrusted strings; exact-membership check against `/api/configs` before loading.
- Use `URLSearchParams` to encode names. Never interpolate a query string manually or place config payloads, secrets, or ETags in browser persistence.

## Next Steps
Phase 01 complete and verified by unit test contracts (27 passing tests) and code review. Ready for Phase 02: Config Form Builder Component.

## Unresolved Questions
- None; precedence and stale-name behavior are fixed above.
