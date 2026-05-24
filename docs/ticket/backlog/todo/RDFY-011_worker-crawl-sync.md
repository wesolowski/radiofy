# [RDFY-011] Worker CLI — `crawl` and `sync` commands

## Type
feature

## Risk
high

## Priority
high

## Status
todo

## Owner
implementer

> `Risk: high` — `sync` writes to Spotify. An external review is required before `done` (see `agents/reviewer.md`).

## Background
This is the end-to-end pipeline: the two commands an operator and the scheduler actually invoke. Until this ticket is done there is no working product.

## Scope
- **In scope**:
  - `apps/worker/commands/crawl.ts`: `bun run crawl --station=<id> [--day=YYYY-MM-DD]` — fetches the source page, parses, normalizes, upserts into `songs` and `plays`, owns the `crawl_runs` audit row. Default `day` is yesterday in `Europe/Warsaw`. Per-row write errors are logged and skipped, do not fail the run.
  - `apps/worker/commands/sync.ts`: `bun run sync --station=<id>` — for the rolling 7-day window: select unique songs (by dedup hierarchy) ordered by play count desc, resolve each via the matcher, build a list of up to **50** Spotify URIs, then call `getPlaylistByName(station.playlistName)` to resolve the target playlist's ID, then call `replacePlaylistTracks(id, uris)`. **Owns the `playlist_sync_runs` audit row** (the Spotify package is pure HTTP, per RDFY-008). The playlist-name lookup happens *after* the URI list is built and non-empty, so a missing playlist surfaces fast but doesn't waste a crawl.
  - **Audit-row contract**: each command inserts a `*_runs` row with `started_at` set and `finished_at = NULL` **before** any side effect (fetch / API call). On success: update the same row with `finished_at`, counts. On thrown failure: update the same row with `finished_at` and `error`, then re-throw / exit non-zero.
  - **Drizzle migrations auto-run at startup** — before opening the first audit row, the worker calls `migrate(db, { migrationsFolder: '...' })`. Idempotent; no-op when up to date. If a migration fails the process exits with code 1 before any other work.
  - **`enabled: false` stations** — `--station` matching a disabled station exits `0` with a one-line `info` log `"station <id> is disabled, skipping"`. Stations not in `config/stations.json` at all exit `1`.
  - Overlap protection: open `crawl_runs` / `playlist_sync_runs` row for the same station newer than 5 minutes → exit `2` with a clear message; older → log "overriding crashed run" and proceed
  - Playlist construction in `sync` groups by **resolved `spotify_track_id`** (post-matcher); unresolved songs excluded; tie-break by `last_seen_at DESC`; `LIMIT 50`
  - Sync pre-checks playlist length; never invokes `replacePlaylistTracks([])` — logs `warn` `"no resolvable songs in window"` and exits 0
  - Structured logging at info level for each phase: fetched / parsed / normalized / resolved / replaced. Each command binds its run file via `logger.bindRunFile('storage/logs/<command>-<station>.log')` before any other work — the file is truncated on every invocation so it always contains exactly the most recent run.
  - Exit codes: `0` success, `1` unrecoverable error, `2` overlap blocked
- **Out of scope (explicit)**: auxiliary commands (`export-unmatched`, `status`, `overrides:validate`, `prune-audit` are RDFY-012), scheduling itself (RDFY-013), Spotify auth bootstrap (RDFY-006).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Applications" → "apps/worker", "Scheduling" → "Overlap protection", "Time Semantics", "Playlist Strategy"
- `RDFY-003`, `RDFY-004`, `RDFY-005`, `RDFY-008`, `RDFY-009`, `RDFY-010`

## Acceptance Criteria
- [ ] On startup, pending Drizzle migrations are applied before any other work; if migration fails the process exits `1` with a clear error and **no** audit row is left open
- [ ] `bun run crawl --station=radio-zet --day=2026-05-24` parses the fixture-equivalent live page and inserts the expected number of `plays` rows
- [ ] Re-running the same crawl is idempotent (no duplicate `plays` thanks to the unique constraint, `crawl_runs` row count grows by exactly one per run)
- [ ] `bun run sync --station=radio-zet` against a populated DB calls `getPlaylistByName(station.playlistName)` then `replacePlaylistTracks` with the top-N (up to 50) songs by play count
- [ ] If `getPlaylistByName` throws `PlaylistNotFoundError`, sync exits `1` with `"create a playlist named '<name>' in Spotify first"`; the `playlist_sync_runs` row is closed with that error message and the `PUT` is never attempted
- [ ] Playlist construction groups by resolved `spotify_track_id` (post-matcher); unresolved songs are excluded; tie-break by `last_seen_at DESC`
- [ ] Sync with zero resolvable songs in the window logs a warning, **does not** call `replacePlaylistTracks`, and exits `0`
- [ ] Both commands open the `*_runs` row (insert with `finished_at = NULL`) before any side effect, then update the **same row** on success (`finished_at`, counts) or failure (`finished_at`, `error`)
- [ ] Concurrent invocation for the same station within 5 minutes exits with code `2` and a clear stderr message
- [ ] An open `*_runs` row older than 5 minutes is treated as crashed; a new run logs `"overriding crashed run <id>"` and proceeds (the crashed row gets `finished_at` and `error="crashed (no heartbeat)"`)
- [ ] `--station` matching an `enabled: false` station exits `0` with `"station <id> is disabled, skipping"`
- [ ] `--station` not present in `config/stations.json` exits with code `1` and a useful message
- [ ] After every run, `storage/logs/sync-<station>.log` (or `crawl-<station>.log`) contains exactly that run's log lines and nothing from prior runs
- [ ] **Sync is end-to-end transactional from the user's perspective**: the `PUT` to Spotify is the last thing that happens; if any earlier step (fetch, normalize, resolve) throws, the playlist on Spotify is **never touched** — the user's current playlist remains untouched until a successful end-to-end run produces a new full set of URIs

## Verification (manual)
1. `bun run crawl --station=radio-zet --day=2026-05-24` → log shows fetched URL, parsed N songs, inserted M plays
2. `bun run sync --station=radio-zet` → Spotify playlist now contains the top tracks; `playlist_sync_runs.tracks_written` matches the playlist length on Spotify
3. Run two `sync` invocations in two terminals within 5 minutes → second exits `2`
4. Disable network mid-sync → run fails with `finished_at` set and `error` populated, no half-empty playlist on Spotify
