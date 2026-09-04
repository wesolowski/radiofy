# RDFY-028 — Unify station ids and commit the station configuration

## Outcome
Approved. The project now uses one spelling per station everywhere — the short
form `zet`, `eska`, `rmf`, `rmfmaxx` — in the configuration, the source
package's station map, the README, the runbook, the scheduling templates and
the architecture document. Commands copied out of the documentation now work
against a real installation instead of failing as unknown stations.

`config/stations.json` ships populated rather than empty, so a fresh clone has
something to crawl and the runbook's setup steps can be followed end to end.

## Which spelling won, and why
Decided by the data, not by preference. Measured before choosing:

| Form | Stations covered | Range | Rows |
|---|---|---|---|
| `zet` / `eska` / `rmf` / `rmfmaxx` | all four | 2026-05-18 – 09-03 | 28,852 |
| `radio-zet` / `radio-eska` | two | 2026-05-18 – 05-25 | 4,457 |
| `rmf-fm` / `rmf-maxx` | none | — | 0 |

Every one of the 4,457 rows under the long ids is an exact duplicate of a row
already stored under the short id — same source, same `source_track_id`, same
`played_at`. They are leftovers of an early rename with no history of their
own. Adopting the long form would have orphaned the entire history to
standardise on a spelling that was real for half the stations and one week.

## The trap this ticket had to avoid
The same strings are two different things in this repository: retired station
ids **and** the genuine malopolskie-media URL slugs. A blanket search-replace
would have rewritten `https://malopolskie-media.info/playlista/radio-zet/…`,
the `sourceSlug` values in the configuration examples and the "Station slugs"
list, making the documentation wrong about the source site.

Replacement was therefore context-bound — `--station=`, `"id":`, log file
names, plist and timer names, and the `s|STATION|…|` recipes — and 31
occurrences were changed across four files while seven were deliberately left.
The review confirmed nothing was renamed that should have stayed and nothing
left that should have changed. It also established that the systemd and launchd
templates carry no station literal at all (only `%i` and `STATION`
placeholders), so there was nothing to change there.

## Files changed
- `config/stations.json` — the four stations, short ids.
- `packages/sources/src/odsluchane-eu/index.ts`,
  `packages/sources/test/odsluchane-eu/url.test.ts` — station map re-keyed,
  test first.
- `README.md`, `docs/operations/runbook.md`,
  `docs/operations/cron/crontab.example`,
  `docs/architecture/PROJECT_ARCHITECTURE.md` — documentation.

## Review findings addressed
The runbook section on leftover rows was wrong on three counts, all verified
against the code and the local database before fixing:

- It called the rows "inert". They are not: `bun run export-unmatched` without
  `--station` lists every open row regardless of station
  (`packages/database/src/repos/unmatched.ts:43` filters only when a station is
  given), so retired entries reach the correction backlog and get curated for a
  station that is no longer crawled — 21 of the 123 open entries locally.
- The cleanup statement covered `plays` only, while the same ids also remain in
  `unmatched_songs` (21 rows) and `crawl_runs` (19 rows).
- It claimed a split `top-played` history. `top-played` scans configured
  stations only (`apps/worker/lib/top-played.ts:41-44`), so retired rows are
  invisible there rather than split.

Also corrected: the setup step "Fill `config/stations.json`" now reads
"Review", since the file ships populated.

## Deliberately not done
No database migration. Station ids are operator configuration, so a migration
shipped with the code would rename or delete ids that are perfectly valid in
another installation. The runbook documents a one-off cleanup, checked before
deleted, naming one id at a time so a copy-paste cannot remove more than was
verified.

Closed tickets and result documents were left untouched — they record what was
true when they were written.

## Follow-ups the review surfaced
- `ODSLUCHANE_EU_STATIONS` is exercised only by its own test; no production
  code consumes it, because the crawler reads `station.sourceSlug` directly.
  Either remove it or use it to validate an `odsluchane-eu` station's slug at
  config load, so a typo fails fast.
- The configuration examples in the runbook and the architecture document still
  show the retired `malopolskie-media` source while the committed file uses
  `odsluchane-eu`. Someone copying the example lands on a blocked source.

## Verification
- `bunx biome check --write` per changed file — clean.
- `bunx tsc --noEmit` — exit 0.
- `bun test` — 276 pass / 1 skip / 0 fail at the time of review.
- `bun run status` — lists exactly the four stations under their short ids, all
  healthy, confirming the committed configuration loads and validates.
