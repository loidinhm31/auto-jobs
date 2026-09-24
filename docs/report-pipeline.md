# Report pipeline and aggregate index

This document describes offline report fixtures, retained run discovery, and
persistent aggregate-index construction. For the broader execution model, see
[architecture](./architecture.md) and [system architecture](./system-architecture.md).

## Offline report fixtures

`src/templates/template-report-fixture.ts` is the supported facade for the
checked-in nine-file corpus. The loader validates saved identities before
browser startup and enforces a 4 MiB per-file and 16 MiB total input limit.
The build-page URL is derived from the unique **Build with Parameters** link in
`#side-panel`; its canonical URL, `POST` action, `#bottom-sticker`, and `Build`
button are validated before routes are installed.

Fixture routes fulfill exact URLs, including the supported login actions and
build `POST`. The build route redirects to the exact job URL without reading or
reflecting form data. Unknown methods and URLs are aborted and recorded as
bounded sanitized misses. These routes are test-only and do not contact Jenkins
or vendor services.

## Run artifacts and discovery

Each report attempt receives an immutable project/run identity under the report
root:

```text
reports/
├── index.html
├── aggregate-data.json
├── assets/report.css
└── <project-id>/<run-id>/
    ├── index.html
    ├── data.json
    ├── manifest.json
    └── requested screenshots
```

`src/artifacts/aggregate-manifest-reader.ts` validates schema-v3 manifests and
their referenced artifacts before retaining them. Discovery is bounded to at
most 5,000 inspected manifests, plus directory and artifact-read budgets.
Invalid or incompatible individual entries are omitted with warnings.

`ManifestDiscoveryResult.incomplete` is true when discovery reaches its
manifest limit or exhausts a directory/artifact budget. This flag distinguishes
a fully inspected inventory from one that may have omitted history; warnings
alone are not a substitute for it.

## Persistent aggregate index

`src/artifacts/aggregate-index-builder.ts` exposes the pure
`buildAggregateIndex` builder. It accepts validated discovery, optional current
project outcomes, an optional timestamp, and warnings; it performs no file I/O.
Current outcomes lead the project list in their execution order and update their
matching historical row. Retained history for other project IDs remains in the
index, ordered by project ID; each project's runs are newest first by
`observedAt`, with `runId` as the tie-breaker.

The builder refuses `discovery.incomplete`. `src/runner.ts` also checks this
before calling the builder, so incomplete inventory cannot replace a more
complete published index. Invalid individual manifests can still be excluded
while valid history is indexed.

An empty `projects` array is a valid schema-v3 aggregate when discovery and
current outcomes are both empty. The static renderer presents this as an empty
state. This index behavior does not relax the schema-v1 configuration rule:
input documents still require 1–50 projects, and report selection still
requires an enabled report project.

The aggregate project ceiling is 5,050, separate from the 50-project input
limit. It allows up to 5,000 historical project IDs from discovered manifests
plus up to 50 current configured projects. Aggregate validation separately
limits retained run entries to 5,000 total.

## Aggregate publication bounds

`src/artifacts/aggregate-report-publisher.ts` stages `aggregate-data.json` and
the rendered root `index.html`, then checks both staged file sizes against
`MAX_STATIC_FILE_BYTES` (16 MiB per file) before writing the publication journal
or replacing the existing pair. If either file is oversized, publication fails
and the prior published files remain intact. Successful publication uses the
existing journal/backup/rollback recovery path.

## Focused contracts

- `tests/unit/aggregate-index-builder.spec.ts` covers empty indexes, incomplete
discovery rejection, historical-only projects, run ordering, current outcomes,
and safe metadata.
- `tests/unit/persistent-aggregate-bounds.spec.ts` covers the 5,050 project
ceiling, empty aggregate validation, discovery completeness, staged-file size
rejection with preservation of the prior pair, and history across runs.
- [Release gates](./release-gates.md) lists the focused test command.
