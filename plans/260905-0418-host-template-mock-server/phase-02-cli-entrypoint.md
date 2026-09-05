# Phase 02: CLI Entrypoint + npm Script

> Parent: [plan.md](plan.md) | Dependencies: [Phase 01](phase-01-core-server.md) | Docs: [report-server-cli.ts](../../src/reporting/report-server-cli.ts)

## Overview
- **Date**: 2026-09-05
- **Priority**: P1
- **Implementation status**: ⬜ pending
- **Review status**: ⬜ pending

## Key Insights
- Follow the exact pattern of `report-server-cli.ts`: parse args, validate, call `createTemplateServer()`, handle SIGINT/SIGTERM
- This project does NOT use `commander` — it has manual arg parsing with `nextArgument()` pattern
- Build output goes to `.runner-build/templates/` (same as `template-report-cli.ts`)
- The npm script should build first, then run from `.runner-build/`

## Requirements
- CLI accepts `--port` (default 4174), `--host` (default 127.0.0.1)
- Prints listening URL on startup
- Graceful shutdown on SIGINT/SIGTERM
- `npm run serve:templates` command in `package.json`

## Architecture
- Manual arg parser (no external deps), matching `report-server-cli.ts` conventions
- Self-executing when run directly (same `import.meta.url` guard pattern)

## Related Code Files
- `src/templates/template-server-cli.ts` **(NEW)**
- [report-server-cli.ts](../../src/reporting/report-server-cli.ts) — CLI pattern reference
- [package.json](../../package.json) — scripts section
- [tsconfig.build.json](../../tsconfig.build.json) — already includes `src/` recursively

## Implementation Steps

- [ ] Create `src/templates/template-server-cli.ts`
- [ ] Implement `parseTemplateServerArgs(argv, env)` returning `{ host, port, help }`
  - `--port` / `TEMPLATE_PORT` env (default 4174)
  - `--host` / `TEMPLATE_HOST` env (default 127.0.0.1)
  - `--help` / `-h` flag
- [ ] Implement `main()` async function:
  - Parse args, show usage if `--help`
  - Call `createTemplateServer({ host, port })`
  - Print `Template server: http://{host}:{port}/`
  - Wire SIGINT/SIGTERM → `handle.close()`
- [ ] Add self-execute guard: `if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))`
- [ ] Add to `package.json`:
  ```json
  "serve:templates": "npm run build && node .runner-build/templates/template-server-cli.js"
  ```

## Todo List
- [ ] CLI implementation
- [ ] npm script addition
- [ ] Verify `tsconfig.build.json` includes the new file in output

## Success Criteria
- `npm run serve:templates` builds and starts the server
- `npm run serve:templates -- --port 5000` uses custom port
- SIGINT cleanly shuts down
- `--help` prints usage

## Risk Assessment
- **Trivial**: Direct copy of existing CLI pattern

## Security Considerations
- Default loopback binding prevents accidental LAN exposure
- No `--allow-lan` flag needed (development-only tool)

## Next Steps
→ Phase 03: Template config
