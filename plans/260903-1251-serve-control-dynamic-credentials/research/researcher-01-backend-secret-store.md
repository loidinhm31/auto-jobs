# Backend secret storage / control API research

## Scope and existing seams

- `ConfigStore` already owns project config file I/O; do not put mutable credentials in project config documents. Add a narrowly scoped secret-store dependency to the control router/API and run-manager options.
- `report-server-control-security.ts` is the existing security boundary (`validateHostHeader` and `validateMutationRequest`). Reuse it; do not duplicate CSRF, Origin, or Fetch Metadata logic in a secrets handler.
- `report-server-control-api.ts` already centralizes JSON parsing and errors (`readBoundedJsonBody`, `sendJson`, `sendError`). A secrets route should use the same helpers and body-size limit.
- `project-config-environment.ts` owns environment-to-project resolution (`resolveProjectSecrets`); the executor must supply one merged environment to normalization rather than resolving secrets in the API layer.

## 1. `report-server-secret-store.ts`

Recommended contract (names can follow the repository's existing type naming):

```ts
interface SecretStore {
  readSecrets(): Promise<Readonly<Record<string, string>>>;
  listSecretNames(): Promise<ReadonlyArray<string>>;
  putSecret(name: string, value: string): Promise<void>;
}
```

Implementation rules:

1. Derive one fixed path from the repository/project root: `path.resolve(root, 'config', 'secrets.local.json')`. Never accept a path or filename from the HTTP request. Before use, assert the resolved basename is exactly `secrets.local.json` and its parent is the intended `config` directory; this prevents traversal and accidental writes to a versioned config file.
2. Missing file (`ENOENT`) means an empty store. Existing file must be UTF-8 JSON, an object (not array/null), and contain only valid environment names (`/^[A-Za-z_][A-Za-z0-9_]{0,127}$/`) mapped to strings. Reject malformed JSON, oversized input (`MAX_CONFIG_FILE_BYTES`), and non-string values with the repository's normal config error; do not coerce values.
3. Normalize to a new ordinary record containing only validated keys, preferably sorted lexicographically for deterministic output. Do not spread/serialize an arbitrary parsed object: this avoids inherited/prototype properties and `toJSON` surprises. `JSON.stringify(normalized, null, 2) + '\n'` is sufficient safe serialization; secret values are never logged.
4. Serialize updates under one in-process write lock (a promise-tail mutex is enough). The critical section must read the latest file, apply the set/update, and write it, so concurrent PUTs cannot lose updates. Reads may be unlocked, but each run should take one snapshot.
5. Atomic write in the same directory: create a uniquely named sibling temp file with exclusive creation (`flag: 'wx'`), write the complete serialized bytes, `fsync`/close it, then rename it to `secrets.local.json`. Clean up the temp file in `finally`. Never truncate/write the target in place. Keep the temp file in the target directory so rename is same-filesystem.
6. Apply `chmod`/`fchmod` `0o600` to the temp file before rename and again to the final path after rename. On POSIX this gives owner-only read/write. Windows `mode` bits are not an ACL boundary; document/rely on the user's directory ACLs rather than claiming `0o600` provides Windows isolation. Avoid replacing an existing file with a delete-then-rename sequence (that creates a non-atomic gap); handle the platform's rename-over-existing behavior in the implementation.
7. If the config directory is created by this feature, create it with restrictive `0o700` where supported, then write the file `0o600`. Do not make broad permission changes to an existing directory.
8. A failed write must leave the previous target intact and must not leave a readable temp secret behind. Return/throw without including the value in the error text.

## 2. Control API contracts and gates

### `GET /api/secrets`

- Router first validates the request Host against the configured control host (same handling as other control API routes), then dispatches the secrets handler.
- Response `200 application/json`, no-store headers, with a presence-only envelope:

```json
{"secrets":{"JENKINS_USERNAME":true,"JENKINS_PASSWORD":true}}
```

An absent/empty store returns `{"secrets":{}}`. Values are never in the response, including empty values (an existing key is still `true`). Do not provide a `name` query that returns a value; if a name filter is desired, return only `{name: boolean}`.
- Read failures become the existing non-secret `5xx` error shape. Never serialize the internal store or include secret values in diagnostics.

### `PUT /api/secrets`

Recommended one-secret-at-a-time request:

```http
PUT /api/secrets
Content-Type: application/json
Origin: <same-origin>
X-CSRF-Token: <control-page token, if the existing helper requires it>

{"name":"JENKINS_PASSWORD","value":"..."}
```

- Call `validateMutationRequest(request, expectedHost)` before parsing/mutating the body. That existing gate must enforce the configured Host, same-origin Origin (reject cross-origin/missing-invalid origin according to the helper's established policy), Fetch Metadata (`Sec-Fetch-Site`), and the control page's CSRF token. Do not invent a weaker secret-specific path or accept a query/header-only bypass. Router-level Host checking must remain in force for GET and PUT.
- Parse with `readBoundedJsonBody`; require a non-null object, `name` string, and `value` string. Validate `name` exactly with `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/`; reject empty, overlong, dashed, dotted, numeric-leading, prototype-like, and non-string names with `400`/the repository's established `INVALID_*` error. Preserve `value` verbatim (including an intentional empty string if the product treats it as configured); never trim or echo it.
- Invoke `putSecret`, then respond `200` (or the existing mutation convention) with only `{name, present:true}`. Do not return the value or request body. A conflict/error from atomic persistence is a non-secret `5xx`; malformed/failed security validation is the existing `4xx` response.
- Keep mutation and response logging metadata-only (method, route, name/status); never log request JSON, headers containing credentials, serialized store contents, or exception strings that can embed values. If deletion is required later, use an explicit contract/route; do not overload a successful PUT with an undocumented null/coercion behavior.

## 3. `executeControlRun` environment injection

At the beginning of `executeControlRun`, obtain one immutable snapshot:

```ts
const baseEnv = options.env ?? process.env;
const stored = await options.secretStore.readSecrets();
const runEnv = { ...baseEnv, ...stored };
```

- Stored values should override same-named inherited values: otherwise a dashboard update cannot reliably change `JENKINS_USERNAME/PASSWORD` when the process started with old values. Do not mutate `process.env` or `options.env`. Keep the object string/undefined-valued as accepted by the existing executor API.
- Pass the same `runEnv` to `normalizeProjectConfigDocument(..., runEnv)`, so `resolveProjectSecrets` sees dashboard-managed values, and to every report and auto-build runner invocation (including child-process `spawn`/Playwright execution options). Do not load secrets separately per project or only on the report path; that creates inconsistent snapshots and misses auto-build runs.
- Snapshot/read errors fail the run before execution; do not silently fall back to stale config or partially merged environments. Missing secrets file is the store's normal empty result.
- `addLog` receives only fixed progress text and non-sensitive identifiers. Never log `runEnv`, `stored`, config JSON, command lines containing `--password`, request bodies, or child-process environment. If lower-level executor errors can contain credential values, redact known secret values at the logging boundary before passing messages to `addLog`; preserve error status/type without echoing the original message verbatim.
- Be careful with URLs: existing `localReportHref`/project logs are not secrets by themselves, but do not append credentials or auth headers to them. Ensure any executor diagnostic redaction handles repeated values and empty strings (do not run a blanket empty-string replacement).

## Unresolved questions

- Confirm the repository's existing `ControlRouterContext`/`RunManagerOptions` naming and exact executor callback signatures before implementation; add `secretStore` without a second global singleton.
- Confirm whether the established JSON envelope uses `secrets`, `variables`, or an array; preserve the control API's existing response/error conventions while retaining the presence-only semantics above.
- Confirm whether the product needs deletion/clearing. If yes, specify `DELETE` or an explicit `{value:null}` contract plus presence semantics; do not infer it from PUT.
- Confirm desired precedence if operators intentionally use process-level overrides; recommendation here is stored-dashboard values win for dynamic credential updates.
