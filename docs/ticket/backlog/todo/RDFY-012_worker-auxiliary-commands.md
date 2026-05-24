# [RDFY-012] Worker CLI — `export-unmatched`, `export-playlist`, `status`, `overrides:validate`, `prune-audit`

## Type
feature

## Risk
low

## Priority
medium

## Status
todo

## Owner
implementer

## Background
Read-only auxiliary commands an operator uses outside the scheduler: triage missing songs, inspect health, validate the override file before relying on it. These are quality-of-life features that do not modify Spotify or the live data.

## Scope
- **In scope**:
  - `apps/worker/commands/export-unmatched.ts`: `bun run export-unmatched [--station=<id>] [--since=YYYY-MM-DD] [--all]` — emits CSV to stdout. Default filters to `resolved_at IS NULL`. `--all` includes resolved rows. `--since` and `--station` compose with each other and with the default filter. Sort by `occurrence_count DESC`, tie-break by `last_seen_at DESC`.
  - `apps/worker/commands/export-playlist.ts`: `bun run export-playlist --name="<playlist name>"` — fetches all tracks from the named Spotify playlist via `getPlaylistByName` + `getPlaylistTracks`, emits CSV to stdout. Columns: `spotify_track_id, primary_artist, all_artists, title, added_at`. Order preserved as Spotify returns them. Used to author manual overrides — see the workflow in `PROJECT_ARCHITECTURE.md → Manual Overrides → Authoring workflow`.
  - `apps/worker/commands/status.ts`: `bun run status` — prints a small table per station with: last successful crawl timestamp, last successful sync timestamp, current `unmatched_songs` open count, current `spotify_matches` cache size, and **count of stuck runs** (open `*_runs` rows older than 5 minutes). Exit code:
    - `0` if every enabled station had a successful crawl in the last 36 hours **and** no stuck runs exist
    - `1` if any enabled station is stale or any stuck rows exist
    - Stations that have **never** been crawled are reported as `"no data yet"` and do not by themselves trigger a non-zero exit (avoids alerting on fresh installs); a `--strict` flag treats them as failure
  - `apps/worker/commands/overrides-validate.ts`: `bun run overrides:validate` — runs `loadOverrides` against `storage/overrides.json`. Output distinguishes three cases: `"no overrides file found"` (exit 0), `"OK: N override(s) loaded"` (exit 0), structured error message (exit 1). Does not touch the DB.
  - `apps/worker/commands/prune-audit.ts`: `bun run prune-audit [--keep-days=90] [--dry-run]` — deletes `crawl_runs` and `playlist_sync_runs` rows older than `keep-days` (default 90). With `--dry-run` only prints counts. Skips rows with `finished_at IS NULL` (don't delete in-flight runs).
  - CSV: RFC 4180 quoting, header row, UTF-8, no BOM
- **Out of scope (explicit)**: any mutation of `songs`, `plays`, `spotify_matches`, `unmatched_songs`; any Spotify call; any background work.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Unmatched Songs Tracking" → "CSV export", "Applications" → "apps/worker"
- `RDFY-003`, `RDFY-010`

## Acceptance Criteria
- [ ] `export-unmatched` produces a valid CSV (quotes around fields containing `,`, `"`, or newlines; double-quoted quotes inside)
- [ ] Default invocation excludes rows with `resolved_at IS NOT NULL`; `--all` includes them
- [ ] Rows sorted by `occurrence_count DESC` then `last_seen_at DESC`
- [ ] `--station=<id>` and `--since=YYYY-MM-DD` compose (both filters apply when both are passed)
- [ ] `export-playlist --name="<name>"` returns the playlist's tracks as CSV with the documented columns; a missing playlist exits `1` with `PlaylistNotFoundError` text; an empty playlist outputs the header row and exits `0`
- [ ] `export-playlist` does **not** write to the database; the only side effect is HTTP reads against Spotify
- [ ] `status` returns the right counts when the DB is hand-seeded with known rows
- [ ] `status` exit `0` on healthy enabled stations with no stuck runs; `1` when any station is stale (>36h) or any stuck `*_runs` row exists
- [ ] `status` reports stations with no data as `"no data yet"`; default mode does not let them flip the exit code; `--strict` does
- [ ] `overrides:validate` distinguishes missing file vs. valid file vs. error in its output and exits accordingly
- [ ] `prune-audit --dry-run` prints the would-delete counts and exits `0` without deleting; without `--dry-run` it deletes only rows with `finished_at IS NOT NULL` older than `--keep-days`
- [ ] None of these commands write to `songs`, `plays`, `spotify_matches`, or `unmatched_songs`

## Verification (manual)
1. Seed DB with 3 unmatched rows (2 open, 1 resolved), run `export-unmatched` → CSV has 2 rows; with `--all` → 3 rows
2. `bun run status` against a healthy DB → table prints, exit `0`
3. Hand-insert an open `crawl_runs` row with `started_at = now - 1h` and `finished_at IS NULL` → `status` exits `1` and reports a stuck run
4. `bun run overrides:validate` against a missing file → "no overrides file found", exit `0`; against a hand-broken file → exit `1`, error names the offending entry index
5. `bun run prune-audit --dry-run --keep-days=30` → prints the counts that would be deleted, deletes nothing
6. Create a Spotify playlist with 3 known songs by hand, run `bun run export-playlist --name="<that name>"` → CSV with 3 rows in the order the songs appear in the playlist; exit `0`
7. Run `export-playlist --name="does not exist"` → exit `1` with `PlaylistNotFoundError` text
8. Pipe `export-unmatched` and `export-playlist` into `column -ts,` → cleanly aligned columns, no quoting glitches
