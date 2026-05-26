# RDFY-022 — sync clear-and-fill, drop 50-track cap

## Result
Approved. Sync now mirrors the full ranked set of resolved tracks instead of capping at 50.

## What was done
- Removed `PLAYLIST_TRACK_CAP` and `PlaylistOverCapError` from `packages/spotify/src/playlist.ts` and the package re-exports in `packages/spotify/src/index.ts`.
- Rewrote `replacePlaylistTracks` as a clear-then-append flow: refuses empty input with `PlaylistEmptyError`, then one `PUT /tracks` with `{"uris": []}` to wipe the playlist, then one or more `POST /tracks` calls in chunks of `PLAYLIST_WRITE_BATCH = 100`. Returns the snapshot id of the last POST. 404 on either the PUT or any POST surfaces as `PlaylistNotFoundError`.
- Dropped the `.slice(0, PLAYLIST_TRACK_CAP)` and the import in `apps/worker/lib/sync.ts`; the full sorted URI list is passed through.
- Updated `packages/spotify/test/playlist.test.ts`: removed over-cap test, added single-batch (3 URIs → PUT [] + 1 POST), 250-URI chunking (PUT + 3 POSTs of 100/100/50 with the last batch verified to start at index 200), `PLAYLIST_WRITE_BATCH === 100` invariant, 404 on clear, 404 on append.
- Updated `apps/worker/test/sync.test.ts` happy path to assert PUT body is `[]` and POST body carries the URIs in rank order.
- README and `docs/architecture/PROJECT_ARCHITECTURE.md` rewritten to describe the clear-then-append flow (no more 50-cap claim, no more atomicity claim).

## Files changed
- `packages/spotify/src/playlist.ts`
- `packages/spotify/src/index.ts`
- `apps/worker/lib/sync.ts`
- `packages/spotify/test/playlist.test.ts`
- `apps/worker/test/sync.test.ts`
- `README.md`
- `docs/architecture/PROJECT_ARCHITECTURE.md`

## Tests
- `bunx biome check` clean on the five changed source/test files
- `bunx tsc --noEmit` clean
- `bun test` — 266 pass / 1 skip / 0 fail (267 across 38 files, 1339 expects)

## Notes
Risk: medium. Adversarial pass confirmed: 404 on the initial PUT short-circuits before any POST fires; 404 mid-append surfaces the same typed error. `PLAYLIST_WRITE_BATCH` matches the documented Spotify 100-URI per-call limit on both `PUT` and `POST /v1/playlists/{id}/tracks`. The doc block on `replacePlaylistTracks` states the *why* (clear-then-append, 100/call limit), not the *what*.
