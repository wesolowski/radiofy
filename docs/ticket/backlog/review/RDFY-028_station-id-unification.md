# RDFY-028 Unify station ids and commit the station configuration

## Type
refactor

## Risk
low

## Priority
high

## Status
review

## Background
The project carries two competing spellings for the same four stations. The
configuration an operator actually runs, every log file and the entire play
history use the short form (`zet`, `eska`, `rmf`, `rmfmaxx`), while the source
package's station map, the README, the runbook, the scheduling templates and
the architecture document all use a longer form (`radio-zet`, `radio-eska`,
`rmf-fm`, `rmf-maxx`). Anyone following the documentation therefore produces
commands that do not match the running configuration.

On top of that, the station configuration file is committed empty. It was
deliberately left that way when the repository was bootstrapped, but a server
deployment clones the repository and finds nothing to crawl — the operator has
to reconstruct the file by hand on every host, which is the one step most
likely to be forgotten.

## Symptom
`bun run crawl --station=radio-zet`, copied from the runbook, fails with
`station 'radio-zet' not found in config/stations.json`. A fresh clone runs
`bun run crawl` successfully but crawls zero stations, because the committed
configuration is an empty list.

## Which spelling wins, and why
The short form, decided by the data rather than by preference:

- The short ids carry the complete play history for all four stations,
  2026-05-18 to 2026-09-03 (28,852 rows).
- The long ids exist for only two of the four stations (`radio-zet`,
  `radio-eska`), only for 2026-05-18 to 2026-05-25, and **every one of those
  4,457 rows is an exact duplicate** of a row already stored under the short
  id — same source, same `source_track_id`, same `played_at`. They are
  leftovers of an early rename and contain no history of their own.
- `rmf-fm` and `rmf-maxx` have never existed in the database at all.

Adopting the long form would therefore orphan the entire history in order to
standardise on a spelling that is real for half the stations and one week.

## Scope
- **In scope**:
  - Commit `config/stations.json` with the four stations, using the short ids.
  - Re-key `ODSLUCHANE_EU_STATIONS` and its test to the short ids.
  - Update `README.md`, `docs/operations/runbook.md`,
    `docs/operations/cron/crontab.example` and
    `docs/architecture/PROJECT_ARCHITECTURE.md` to the short ids.
  - Document the duplicate historical rows in the runbook, with a one-off
    cleanup statement the operator can choose to run.
- **Out of scope (explicit)**:
  - Closed tickets under `docs/ticket/backlog/done/` and `docs/ticket/results/`.
    They record what was true when they were written and are not rewritten.
  - Any automatic database migration. Station ids are operator configuration,
    so a migration shipped with the code would rename ids in every fork's
    database, including ids that are perfectly valid there.
  - Any change to crawling, syncing or matching behaviour.
  - Restructuring the scheduling templates beyond the rename.

## Why committing the configuration is safe for a public repository
`.claude/CLAUDE.md` lists Spotify playlist **names** as identifiers rather than
secrets: the worker resolves a name to an id at runtime through the operator's
own OAuth token, so a name in the repository grants nobody access to anything.
A forker replaces the names with their own and creates matching playlists; if
they do not, `sync` reports `playlist_not_found` with an actionable message
instead of touching anything.

## References
- `config/stations.json`
- `packages/sources/src/odsluchane-eu/index.ts`
- `packages/sources/test/odsluchane-eu/url.test.ts`
- `docs/operations/cron/crontab.example`
- `docs/operations/runbook.md`
- `docs/architecture/PROJECT_ARCHITECTURE.md`

## Acceptance Criteria
- [ ] `config/stations.json` holds four enabled stations with the ids `zet`,
      `eska`, `rmf` and `rmfmaxx`, and validates against the existing schema.
- [ ] `ODSLUCHANE_EU_STATIONS` maps `zet`→`1`, `rmf`→`2`, `eska`→`3`,
      `rmfmaxx`→`4`, and its test asserts the new keys.
- [ ] No occurrence of `radio-zet`, `radio-eska`, `rmf-fm` or `rmf-maxx`
      remains **as a station id** in `README.md`, `docs/operations/` or
      `docs/architecture/PROJECT_ARCHITECTURE.md`. The same strings stay where
      they are the malopolskie-media **URL slugs** — the `sourceSlug` values in
      the configuration examples, the example URLs and the "Station slugs"
      list. Those name pages on the source site, not stations here, and
      renaming them would make the documentation wrong.
- [ ] Closed tickets and result documents are untouched.
- [ ] `bun run crawl --station=zet --day=<date>` from a fresh clone resolves the
      station instead of reporting it as unknown.
- [ ] The runbook explains the duplicate historical rows and offers the
      cleanup statement without running it automatically.
- [ ] `bun test` passes.

## Verification (manual)
1. `bun run status` → lists exactly the four stations under their short ids.
2. Copy any `--station=` command out of the runbook and run it → the station
   resolves.
3. `git grep -n 'radio-zet\|radio-eska\|rmf-fm\|rmf-maxx' -- README.md docs/operations docs/architecture`
   → only `sourceSlug` values, malopolskie-media URLs and the "Station slugs"
   list remain.
