# RDFY-036 — Prose still presented the retired source as current

## Outcome
Done. The documentation names the source the worker actually reaches.

RDFY-033 corrected the two configuration examples, but only those. The
surrounding prose still described `malopolskie-media.info` as the source in
use — in the pipeline summary a reader meets first, under a "Data source"
heading, and in two statements about what the project relies on. A reader who
never reached the deprecation section three hundred lines down came away with
the wrong idea of what this talks to.

Two copyable examples named it as well: the manual-override entry and the
schema comment, both of which would have produced a source id the worker no
longer uses.

## Files changed
- `README.md` — pipeline step 1 and the "Data source" section, which now also
  states why the original source's parser is still in the codebase.
- `docs/architecture/PROJECT_ARCHITECTURE.md` — the two "relies on" statements,
  the override example and the schema comment.

## Deliberately untouched
The "malopolskie-media.info (deprecated)" section with its URL examples, the
historical note explaining the switch, the package-tree listings, and the parser
with its fixtures and tests. The first two are accurate records; the last still
works and would be needed if that site became reachable again.

## Verification
- A sweep for the retired name across the README, the architecture document and
  the runbook leaves hits only inside the deprecated section, the historical
  note, and file-tree listings.
- `bunx tsc --noEmit` — exit 0. `bun test` — 327 pass / 1 skip / 0 fail.
