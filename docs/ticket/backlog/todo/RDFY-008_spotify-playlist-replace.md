# [RDFY-008] Spotify playlist discovery + replace

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

> `Risk: high` — this writes to user playlists. An external review is required before `done` (see `agents/reviewer.md`).

## Background
The end state of every sync run is "replace the contents of one Spotify playlist". Spotify's API hard limit for a single atomic `PUT` is 100 URIs; the MVP caps playlists at **50 tracks** (same conservative cap the previous Rust prototype used) so every replace is a single atomic call with no observable intermediate state.

This package is a thin Spotify wrapper — it does **not** touch the database. The `playlist_sync_runs` audit row is owned by the worker orchestrator (RDFY-011); this package only performs the HTTP call and surfaces success or typed errors.

## Scope
- **In scope**:
  - `packages/spotify/playlist.ts`: three functions
    - `getPlaylistByName(name): Promise<{ id: string }>` — paginates `GET /v1/me/playlists` (50 per page) until a playlist with `name === <arg>` is found. No match → `PlaylistNotFoundError(name)`. Multiple matches → return first, log `warn` `"multiple playlists named '<name>', using first"`.
    - `getPlaylistTracks(playlistId): Promise<PlaylistTrack[]>` — paginates `GET /v1/playlists/{id}/tracks` (100 per page) and returns the full list as `{ spotifyTrackId, primaryArtist, allArtists, title, addedAt }`. Empty playlist → returns `[]`. Local episodes (non-track items) are skipped with a `debug` log line.
    - `replacePlaylistTracks(playlistId, spotifyTrackIds): Promise<{ snapshotId: string }>` — single `PUT /v1/playlists/{id}/tracks` for up to 50 URIs
  - Reject inputs over 50 with a typed `PlaylistOverCapError` (MVP cap, documented)
  - Reject empty input with `PlaylistEmptyError` — never empty a playlist by accident (defense in depth; the orchestrator also pre-checks)
  - Honor `Retry-After` on 429; backoff retry on 5xx (max 3); 404 on playlist throws `PlaylistNotFoundError` with the ID
  - Functions are **stateless with respect to the database** — no Drizzle imports, no audit-row writes
- **Out of scope (explicit)**: matcher logic, track selection, removal of existing tracks (the API replaces atomically), >50-track support (deferred), playlist auto-creation (operator creates by hand), `playlist_sync_runs` writes (RDFY-011 owns the audit row), caching of name → ID lookups across runs.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Playlist Strategy" → "Update atomicity", "Update trigger"
- `RDFY-003`, `RDFY-006`

## Acceptance Criteria
- [ ] `getPlaylistByName("X")` returns the first playlist whose name matches exactly when one exists in the user's library
- [ ] `getPlaylistByName` paginates correctly: when the target playlist is on page 3, it traverses pages 1 and 2 first (verified with a 3-page HTTP fixture)
- [ ] `getPlaylistTracks(id)` returns all tracks across multiple pages in the order Spotify returns them
- [ ] `getPlaylistTracks` on an empty playlist returns `[]` (no throw)
- [ ] `getPlaylistTracks` skips non-track items (local files, episodes) with a `debug` log entry and does not crash
- [ ] No match → throws `PlaylistNotFoundError(name)` with the name in the message
- [ ] Multiple matches → returns the first one **and** logs a `warn` line that includes the name
- [ ] `replacePlaylistTracks(id, tracks)` issues exactly one `PUT` for `0 < tracks.length <= 50`
- [ ] `tracks.length === 0` throws `PlaylistEmptyError` without any HTTP call
- [ ] `tracks.length > 50` throws `PlaylistOverCapError` without any HTTP call
- [ ] On 2xx, returns the response `snapshot_id`
- [ ] 404 on the playlist throws `PlaylistNotFoundError` with the ID in the message
- [ ] 429 with `Retry-After: N` sleeps N seconds then retries exactly once (applies to both `getPlaylistByName` and `replacePlaylistTracks`)
- [ ] 5xx triggers exponential backoff up to 3 retries, then throws `SpotifyTransientError`
- [ ] No DB imports in the package (`grep -r drizzle packages/spotify/` returns nothing); no `playlist_sync_runs` writes from this package
- [ ] HTTP-fake unit tests cover both functions: happy path, 429+retry, 5xx+backoff, 404, empty input, over-cap input, pagination, name not found, name duplicate

## Verification (manual)
1. Create a Spotify playlist named "Radiofy Test Playlist" by hand. Call `getPlaylistByName("Radiofy Test Playlist")` → returns the right ID
2. Rename the playlist, call again → `PlaylistNotFoundError`
3. Create a second playlist with the same name → `getPlaylistByName` returns the first one and logs a warning
4. Pass the returned ID to `replacePlaylistTracks(id, [3 known URIs])` → playlist visibly contains exactly those three tracks in that order; returned `snapshotId` is non-empty
5. Replace with the same input again → still exactly those three tracks, new `snapshotId`
6. Replace with `[]` → `PlaylistEmptyError`, no API call (verify with network log)
7. Replace with 51 URIs → `PlaylistOverCapError`, no API call
