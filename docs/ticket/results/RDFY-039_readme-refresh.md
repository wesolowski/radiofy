# RDFY-039 — The README described an earlier version of the project

## Outcome
Done. The introduction, the overview and the Quickstart now match the project
as it stands.

## What was wrong
- The status line claimed thirteen merged tickets. There were thirty-eight. It
  had been wrong for weeks and sat in the first fifteen lines.
- "What it does" described only the station pipeline. The chart path has been a
  first-class second path since RDFY-027, so a reader had no reason to look for
  `bun run chart`.
- Quickstart step 4 told the reader to fill `config/stations.json`, which has
  shipped populated since RDFY-028. RDFY-033 corrected that wording in the
  runbook and the architecture document but not here.
- `config/charts.json` appeared nowhere in the Quickstart, so there was no
  entry point for the chart.
- The Quickstart ended at a single station sync, predating `weekly`, and never
  mentioned the report page.

## Decisions
The ticket count was removed rather than corrected. A number like that is stale
the day it is written, and the next person to update it would face the same
problem. What replaces it says what runs today and states plainly that nothing
is scheduled out of the box — which is the one thing a reader most needs to
know about this project's current state.

The command reference was deliberately left alone. Every command added during
this cycle documented itself as it landed, so it was already current; only the
prose around it had drifted.

## Files changed
- `README.md` — status line, a new "Two kinds of playlist" section in the
  overview, and the Quickstart.

## Verification
- Every `bun run` command named in the Quickstart was checked against
  `package.json`: `weekly`, `chart`, `report`, `spotify:auth` all exist.
- No claim about ticket counts remains.
- `bunx tsc --noEmit` — exit 0. `bun test` — 347 pass / 1 skip / 0 fail.
