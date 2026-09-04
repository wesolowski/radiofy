# RDFY-026 — One-shot weekly command

## Outcome
Approved after one round of review changes. `bun run weekly` now performs the
whole weekly refresh in a single invocation: it crawls every enabled station
over the default window, then syncs every enabled station. The sync phase runs
regardless of the crawl phase's result, so a partial upstream outage still
yields an up-to-date playlist built from the days that did arrive, while the
exit code still reports the run as unsuccessful. `crawl` and `sync` are
unchanged and remain the way to crawl without touching Spotify or to re-sync
after editing overrides.

Branched off `rdfy-025-crawl-retry-day-isolation` rather than `main`: `main`
does not yet carry `CrawlOutcome.daysFailed`, so a `weekly` built against it
would have reported a run with lost days as a success the moment RDFY-025
merged.

## Files changed
- `apps/worker/lib/weekly.ts` — new; `runWeekly()` with injectable db,
  stations path, overrides path, access token and clock, mirroring the option
  shape `runCrawl`/`runSync` already use.
- `apps/worker/commands/weekly.ts` — new; thin entry point, exit codes only.
- `apps/worker/test/weekly.test.ts` — new; four tests.
- `package.json` — `weekly` script.
- `README.md` — command documented under the scheduler section, with an
  explicit note that the shipped `docs/operations/` templates still install
  the split daily-crawl / weekly-sync jobs.

## Acceptance criteria
- Crawls every enabled station and then syncs every enabled station; a
  disabled station is skipped in both phases.
- A permanently failing crawl day does not stop the sync phase; the outcome
  reports the failure.
- An unresolvable sync window is not a failure and attempts no playlist
  replacement.
- Exit codes: `0` clean, `1` any failure, `2` any blocked run — verified by
  inspection against the existing `crawl`/`sync` commands, consistent with the
  repo having no tests for any `commands/*` entry point.
- `bun test apps/worker` passes.

## Review findings addressed
- **Phase ordering was not actually proven.** The orchestration test passed
  regardless of order: an unresolvable sync window closes its run with
  `tracksWritten = 0` and no error, which `syncRunsRepo.lastSuccess` still
  returns, so every assertion held even with the phases reversed — the exact
  mistake the ticket exists to prevent. The test now drives a real match
  through to a playlist write, reachable only when the crawl ran first, and
  the failing-day case asserts that no playlist write happens when nothing
  resolves. Confirmed by temporarily swapping the two phases: the test fails
  (`3 pass, 1 fail`) and passes again once restored.
- **Dead option removed.** `WeeklyOptions.fetchFn` was forwarded only to
  `runCrawl`, used by no caller and no test; `SyncOptions` has no fetch
  injection at all.
- **README contradiction removed.** The command was described as the one a
  scheduler should call while the shipped templates still install the split
  jobs.

Accepted as-is, with reasons recorded: a blocked crawl still syncs that
station (consistent with the "sync runs regardless" rule, no integrity
impact); the failed/blocked bookkeeping stays duplicated rather than extracted
(a shared helper across two different discriminated unions would be longer
than what it replaces and would require touching the two existing commands,
which the ticket puts out of scope).

## Constraint carried forward
The Eska Gorąca 20 chart playlist must never become an entry in
`config/stations.json`. Both all-stations loops run over
`loadEnabledStationIds()`, so any entry there is reachable by a plain
`bun run sync`, not just by `weekly`. Keeping the chart out of the station
config is what guarantees no station loop can reach it; it gets its own
snapshot path in a separate ticket, which should cross-reference this
constraint.

## Verification
- `bunx biome check --write` per changed file — clean.
- `bunx tsc --noEmit` — exit 0, no diagnostics.
- `bun test` — 280 pass / 1 skip / 0 fail, 1388 expect() calls across 39 files.
- Real run: `bun run weekly` against the four configured stations — crawl and
  sync phases both completed in 49s, `failed: false`, `blocked: false`,
  exit 0. This is what covers `commands/weekly.ts` and the `openDb()` default
  path, neither of which the unit tests reach.
- Pre-commit hygiene: no secrets, tokens, personal identifiers, AI-authorship
  markers, database or log snapshots in the staged diff.
