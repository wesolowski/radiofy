# RDFY-026 One-shot weekly command: `bun run weekly`

## Type
feature

## Risk
low

## Priority
high

## Status
done

## Owner
implementer

## Background
Refreshing the station playlists currently takes two separate invocations —
first the radio-side ingestion, then the Spotify-side replacement. For the
recurring weekly job that split has no benefit and one concrete downside: the
two steps can be run in the wrong order, and a playlist replacement started
without fresh ingestion silently does nothing. The operator wants a single
entry point that performs the whole weekly refresh, so the scheduler needs one
line and one exit code.

## Scope
- **In scope**:
  - A new `weekly` command that crawls every enabled station over the default
    window and then syncs every enabled station.
  - The sync phase runs even when the crawl phase lost days or stations, so a
    partial upstream outage still produces an up-to-date playlist.
  - Exit codes follow the existing convention: `0` clean, `1` any failure,
    `2` any blocked run.
- **Out of scope (explicit)**:
  - No changes to `crawl` or `sync`. They stay available for the cases the
    combined command deliberately does not cover: crawling without any Spotify
    call, and re-syncing after editing overrides without re-crawling.
  - No CLI flags on `weekly` (no `--station`, no `--days`, no `--day`).
  - No scheduler installation and no failure notification — separate tickets.
  - No pruning or housekeeping steps.

## Constraint — Eska Gorąca 20 must never be touched
The forthcoming Eska Gorąca 20 chart playlist must **not** become an entry in
`config/stations.json`. Both `crawl` and `sync` iterate
`loadEnabledStationIds()` over that file, so any entry there is reachable by
the all-stations loops — a chart playlist added as a station would be
overwritten by a plain `bun run sync`, not just by `weekly`. Gorąca 20 gets its
own snapshot path in a separate ticket; keeping it out of the station config is
what guarantees no station loop can reach it.

## References
- `apps/worker/commands/crawl.ts`
- `apps/worker/commands/sync.ts`
- `apps/worker/lib/station-loader.ts`
- `package.json`
- `README.md`

## Acceptance Criteria
- [ ] `runWeekly` crawls every enabled station and then syncs every enabled
      station; a disabled station is skipped in both phases.
- [ ] When a crawl day fails permanently, the sync phase still runs and the
      returned outcome reports the failure.
- [ ] When the sync window holds no resolvable songs, the outcome is not a
      failure and no playlist replacement is attempted.
- [ ] `bun run weekly` exits `0` when everything succeeded, `1` when anything
      failed, `2` when anything was blocked.
- [ ] `bun test apps/worker` passes.

## Verification (manual)
1. `bun run weekly` → crawls all enabled stations, then syncs them; exits `0`.
2. `bun run weekly` with one day 5xx-ing → that day is skipped, the sync still
   runs, the process exits non-zero.
3. `bun run status` after step 1 → `last_crawl` and `last_sync` both show the
   run just performed for every enabled station.
