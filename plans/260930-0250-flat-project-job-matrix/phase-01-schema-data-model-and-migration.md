# Phase 01 — schema, data model, lossless migration (DONE — 2026-09-30)

## Context links

[Plan](./plan.md) · [Architecture/data contract](./architecture-design.md#data-contract) · [Backend research](./research/researcher-01-backend-schema-exec.md) · [Code standards](../../docs/code-standards.md) · [Current config contract](../../docs/multi-project-configuration.md)

## Overview

- Priority: P2 · Status: DONE · Completed: 2026-09-30 · Estimate: 6h.
- Extend the **existing** schema-v1 document with strictly validated shared columns, per-project URL cells and saved multi-selection. Project existing `jobUrl` remains a usable scalar for CLI and library consumers. Legacy V1 loads without rewriting a byte; UI uses an in-memory expansion.

## Key insights

- `assertProjectConfigDocument` rejects unknown root/project keys; `createConfigStore.readConfig` validates before returning the ETag/document. Validator, client types and normalizer must agree; adding a UI-only field will fail Save.
- Existing `jobUrl` and `loginUrl` are required; `deriveJenkinsBaseUrl` checks same Jenkins context. Blank cells are allowed, but a row cannot be saved without one valid primary URL while scalar `jobUrl` stays required.
- Client document types live in `src/reporting/control-page/types/index.ts`; server types in `src/config/config-types.ts`. Raw JSON Apply uses the shared runtime assertion. The server must not silently turn a GET into a migration write.
- Old strict binaries reject unknown keys; `schemaVersion: 1` plus mirror does not make a newly saved matrix document consumable by those binaries. Updated repo CLI consumers can retain scalar behavior.

## Requirements

1. Root optional `jobColumns: {id:string,name:string}[]`, each project optional `jobs: Record<columnId,string>` and `selectedJobColumns: string[]`; persist one shared heading set, different URL per row, and multiple selections. Existing fields remain unchanged.
2. Legacy absence of all matrix keys projects as one `{id:'default', name:'Job URL'}` column with each row's existing `jobUrl` and `['default']`; omit migration write until explicit Save/edit. Empty *explicit* selection never becomes default.
3. Saved expanded model: 1–50 columns, unique safe IDs 1–16 characters, bounded names; each row maps exactly declared IDs to strings; selected IDs unique and declared. Nonblank cell URL uses existing exact credential-free HTTP(S)/same Jenkins context checks. Primary `jobUrl` mirrors first nonblank URL in heading order. Preserve optional groups/defaults and every existing project setting.
4. Fail validation for incomplete/extra matrix keys, mismatched mirrors, rows without nonblank URLs, prototype-poison keys, malformed URLs and over-1-MiB files. Use existing project-ID safety, name, URL and size helpers; no blanket index-signature acceptance at server boundary.

## Architecture

`JSON file -> assertProjectConfigDocument (accept legacy or complete matrix) -> ConfigStore GET untouched -> pure projectLegacyMatrixDocument for UI -> editor.currentDoc -> validated PUT with If-Match -> file`. Direct `normalizeProjectConfigDocument` and CLI continue using `jobUrl`; matrix execution builds normalized per-cell virtual target snapshots in Phase 04. Do not mutate `projectGroups`, `groupId`, defaults or raw secret variable references. Migration is idempotent and deterministic: `upgrade(upgrade(doc))` equals `upgrade(doc)`; same V1 file yields same UI projection.

## Related code files

| Action | Path | Planned change |
| --- | --- | --- |
| Modify | `src/config/config-types.ts` | Declare column/cell/selection types without disturbing normalized runner type. |
| Modify | `src/config/project-config-project-validation.ts` | Add allowed keys and call narrow job-cell validation. |
| Modify | `src/config/project-config-schema.ts` | Validate root columns and cross-row mirror/selection; keep V1 path. |
| Create | `src/config/project-job-matrix-validation.ts` | Shared pure cross-field checks, small module under 200 LOC. |
| Create | `src/config/project-job-matrix-upgrade.ts` | Pure deterministic in-memory V1 projection; no I/O. |
| Modify | `src/reporting/control-page/types/index.ts` | Align browser-safe saved document contract with server fields. |
| Modify | `src/reporting/control-page/hooks/useConfigManager.ts` and `hooks/useConfigDocumentEditor.ts` | Load/Apply projection with correct dirty/replacement semantics (Phase 03 integrates). |
| Modify | `src/config.ts`, `docs/multi-project-configuration.md`, `config/projects.example.json` (if fixture update justified) | Export new contract/describe mixed V1 and expanded semantics without invalidating legacy examples. |
| Modify | `tests/unit/project-config.spec.ts`, `tests/unit/config.spec.ts`, `tests/unit/control-config-api.spec.ts` | Cover V1 and matrix read/save/ETag. |

## Implementation steps

1. Inspect current schema/default normalization/test fixture contracts; confirm 63-character project ID and artifact `SAFE_ID` 81-character bound. Define safe column ID ≤16 and <=50 shared columns. IDs stable through rename; reject collisions at validation, not by auto-renaming imported JSON.
2. Add optional types and strict key lists. For root with `jobColumns`, require complete `jobs` for each project; default absent `selectedJobColumns` only during explicit V1 upgrade, not for partially expanded documents. Without root columns, reject stray per-project matrix keys. Keep arrays/maps bounded and reject magic object keys.
3. Validate each nonblank cell with existing `exactUrl` plus `deriveJenkinsBaseUrl(loginUrl, cellUrl)`; skip only zero/whitespace strings. Require first nonblank cell equals scalar `jobUrl` (use defined raw/canonical comparison consistently with current URL policy). Last nonblank URL removal leaves an invalid draft until repaired. Preserve legacy route of the validator when no matrix keys exist.
4. Implement pure V1 projection. Shallow clone root/rows only; spread **recognized** fields, add default jobs and selection, avoid overwriting preexisting expanded fields. Do not materialize resolved defaults/secret values. Choose one owner for projection (config layer) so raw Apply, GET and server tests share behavior.
5. Exercise round-trip on a real legacy example: validate original, project into matrix, validate projection, Save with matching ETag, reload, ensure deep equality for all original fields and unchanged scalar URL. Re-apply upgrade and verify idempotence. Keep original file unchanged before Save.
6. Make newly saved `jobUrl` deterministic mirror for updated CLI. Document old binary incompatibility and rollback/backups; avoid a fake schemaVersion=2 migration or alias just to hide strict-key conflicts.

## Todo list

- [x] Shared types and strict cross-field validator with URL/context and ID bounds.
- [x] Pure V1-to-matrix projector; no read-side persistence and no automatic dirty flag.
- [x] Deterministic primary mirror and legacy CLI normalized behavior.
- [x] Tests for omitted/present keys, advanced data, URL and selection failures, and ETag round-trip.
- [x] Explicit limits and old strict-binary compatibility caveat in config docs.

## Success criteria

- A legacy V1 JSON with `projectGroups`, `defaults`, `loginUrl`, `selectors`, `credentials`, browser, timeouts and waits reads untouched; updated UI shows one default column per row; guarded Save/reload retains all fields and scalar URL.
- Matrix documents with 2+ headings, different row URLs and 2+ saved selections validate/reload; malformed or mixed partial documents fail clearly.
- Updated direct CLI still uses `jobUrl`; no read-time ETag change; tests cover bound, blank/missing URL, duplicate/unsafe key and cross-context failures.

## Risk assessment

- **Strict older executables reject new keys:** publish this limit, back up original files, plan rollback/export separately if required; do not claim `jobUrl` alone solves it.
- **Primary mirror may be left stale:** validate equality server-side and recompute transactionally in Phase 03.
- **Existing >200-LOC validator:** extract small pure validation module instead of extending oversized files.

## Security considerations

- Reuse URL normalization and same Jenkins base context validation for **every** cell, not only primary; ban credential-bearing/query URLs and dangerous map keys. Never copy secret values into document; credentials remain environment variable names. Bound dimensions and 1 MiB store limits before I/O; reject unknown keys.

## Next steps

- Phase 01 is DONE as of 2026-09-30; review scored 9.2/10. The reported prototype-chain presence check now uses own-property lookup; duplicate column IDs are rejected, though cell diagnostics can repeat.
- Phase 02 (spreadsheet matrix UI) is DONE as of 2026-09-30; see its [validation report](../reports/phase02tester-260930-0939-spreadsheet-matrix-validation.md) and [code review](./code-review-260930-0941-phase-02-spreadsheet-matrix-ui-components.md).
- Phase 03 will integrate `projectLegacyMatrixDocument` into `useConfigManager` / `useConfigDocumentEditor` for edit/save lifecycle and implement pure matrix document transitions.

## Real remaining decisions

- If an older strict-validator binary must read new matrix configs, product needs explicit compatibility export requirements; mirror-only cannot satisfy its unknown-key policy.
