# [RDFY-017] top-played console command

## Type
feature

## Risk
low

## Priority
medium

## Status
in-progress

## Owner
implementer

## Background
The operator wants to see at a glance which songs were played most on each station in the last week, with play counts, formatted for the terminal (not CSV). The existing `export-unmatched` and `export-playlist` commands answer different questions; nothing today shows the raw "top of the charts" view across the rolling 7-day window.

## Scope
- **In scope**:
  - `apps/worker/lib/top-played.ts`: `runTopPlayed(options)` — queries `playsRepo.findResolutionInputsInWindow` per station, takes the top N, prints a pretty table to stdout.
  - `apps/worker/commands/top-played.ts`: thin CLI wrapper around `runTopPlayed`.
  - Flags: `--station=<id>` (default: every enabled station), `--limit=<N>` (default: 20), `--since=YYYY-MM-DD` (default: rolling 7 days back from now).
  - Output: per-station header, then a fixed-width table with `rank`, `plays`, `artist - title`. Resolved Spotify-track id printed in dim grey when known.
  - Read-only: no writes to `plays`, `songs`, `spotify_matches`, `unmatched_songs`, audit tables.
  - Root `package.json` script: `"top-played": "bun apps/worker/commands/top-played.ts"`.
- **Out of scope (explicit)**: any CSV output (use `export-unmatched` / `export-playlist` for that); any Spotify API call; sorting or grouping by resolved Spotify track (uses canonical song-id grouping the worker already does).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Database Strategy"
- `packages/database/src/repos/plays.ts` → `findResolutionInputsInWindow`
- `RDFY-012` (auxiliary read-only CLI commands)

## Acceptance Criteria
- [ ] `bun run top-played` prints one block per enabled station with the top 20 by play count
- [ ] `--station=<id>` limits output to one station
- [ ] `--limit=<N>` limits the row count
- [ ] `--since=YYYY-MM-DD` filters by `played_at >= since`; default is now − 7 days
- [ ] Output is fixed-width plain text (no ANSI for plays/rank/title; dim grey is OK for the Spotify id when present, but the command must remain readable when piped to a file)
- [ ] Disabled stations (`enabled: false`) are skipped entirely
- [ ] Command does not write to `plays`, `songs`, `spotify_matches`, `unmatched_songs` (grep verified)
- [ ] `bun test apps/worker/test/` passes (existing tests + new top-played tests)
- [ ] `bunx tsc --noEmit` and `bunx biome check .` clean

## Verification (manual)
1. With a populated db, `bun run top-played --station=radio-zet --limit=5` prints exactly 5 rows ordered by play count descending.
2. Output piped through `tee` produces the same content as on the terminal (no ANSI escapes break the layout).
