# [RDFY-022] sync: clear-and-fill playlist without 50-track cap

## Type
bug

## Risk
medium

## Priority
high

## Status
review

## Owner
implementer

## Background
Two related defects in the sync path are limiting what shows up in Spotify:

1. The Radio Zet target playlist only ever contains 50 tracks even when the
   week's resolved set is larger. Cause: a hardcoded `PLAYLIST_TRACK_CAP = 50`
   in `packages/spotify/src/playlist.ts` is enforced both in `replacePlaylistTracks`
   (it throws `PlaylistOverCapError` above 50) and in `apps/worker/lib/sync.ts`
   (which slices the sorted candidate list to 50 before the call). Both are
   artificial limits — Spotify itself accepts up to 100 URIs per single API
   call and unlimited URIs across multiple calls.
2. The operator expects the playlist to be *cleared and re-filled* on every
   sync, not "diffed and patched". The current `PUT /tracks` call is already
   semantically a full replace, but is bound by the 100-URI-per-request limit
   so any playlist over 100 tracks needs an explicit clear plus chunked
   appends. Today the worker can't get past 50 anyway, so the multi-call path
   has never run.

## Symptom (bugs only)
- `bun run sync --station=radio-zet` ends with `tracksWritten: 50` in the log
  even when `bun run top-played radio-zet --limit=200` shows hundreds of
  unique resolved songs in the week.
- No error is raised; the operator sees a partial playlist and assumes the
  crawl missed songs.

## Scope
- **In scope**:
  - Remove `PLAYLIST_TRACK_CAP` and `PlaylistOverCapError` from
    `packages/spotify/src/playlist.ts` and its re-exports in
    `packages/spotify/src/index.ts`.
  - Rewrite `replacePlaylistTracks(playlistId, spotifyTrackIds, accessToken)`
    so that it: (a) refuses an empty input with `PlaylistEmptyError`; (b)
    issues one `PUT /tracks` with `{"uris": []}` to clear the playlist
    regardless of its current size; (c) chunks the new URIs into batches of
    100 and `POST /tracks` each; (d) returns the snapshot id from the last
    call. Translation `id → spotify:track:id` stays.
  - In `apps/worker/lib/sync.ts`, drop the `.slice(0, PLAYLIST_TRACK_CAP)`
    and the import of `PLAYLIST_TRACK_CAP`. Pass the full sorted URI list
    to `replacePlaylistTracks`.
  - Update `packages/spotify/test/playlist.test.ts`: remove the over-cap
    test, replace the single-PUT assertion with a clear-then-append flow,
    add a chunking test that proves a 250-URI input issues 1 PUT (empty)
    plus 3 POSTs of sizes 100/100/50.
  - Quick docs touch: README `bun run sync` row no longer mentions the 50
    cap. The architecture doc gets a one-line update noting that sync now
    clears then appends in chunks of 100.
- **Out of scope (explicit)**:
  - Soft-delete / archive of removed tracks. The playlist is the worker's
    output; it's expected to overwrite itself.
  - Concurrency or rate-limit retry tuning. `spotifyFetch` already handles
    429 / transient errors.
  - Reading the current playlist contents before clearing. The "diff"
    approach is intentionally removed.

## References
- `packages/spotify/src/playlist.ts:5` — `PLAYLIST_TRACK_CAP = 50`
- `packages/spotify/src/playlist.ts:156-190` — `replacePlaylistTracks`
- `apps/worker/lib/sync.ts:136` — `sorted.slice(0, PLAYLIST_TRACK_CAP)`
- Spotify Web API:
  - `PUT /v1/playlists/{playlist_id}/tracks` — replaces, max 100 URIs/call
  - `POST /v1/playlists/{playlist_id}/tracks` — appends, max 100 URIs/call

## Acceptance Criteria
- [ ] `PLAYLIST_TRACK_CAP` and `PlaylistOverCapError` no longer exported by
      `@radiofy/spotify`
- [ ] `replacePlaylistTracks(playlistId, [], token)` still throws
      `PlaylistEmptyError` with no HTTP call
- [ ] `replacePlaylistTracks(playlistId, [50 ids], token)` issues exactly two
      calls: `PUT /tracks` with `{"uris":[]}` then `POST /tracks` with the 50
      URIs
- [ ] `replacePlaylistTracks(playlistId, [250 ids], token)` issues exactly
      four calls: `PUT /tracks` empty, then `POST /tracks` ×3 with batches of
      100, 100, 50, in order
- [ ] The returned snapshot id matches the last POST's `snapshot_id`
- [ ] `apps/worker/lib/sync.ts` no longer imports `PLAYLIST_TRACK_CAP` and no
      longer slices the candidate list
- [ ] `bunx tsc --noEmit` clean, `bunx biome check .` clean,
      `bun test` 264 pass / 1 skip / 0 fail (unit-test counts may shift by
      ±1 with the test reshuffle — the suite must remain green)

## Verification (manual)
1. `bun run sync --station=radio-zet` on a real account with >100 resolved
   tracks → expected: Spotify playlist holds every resolved track in order,
   log line `sync: done` reports the full count
2. Re-run the sync without changes → expected: playlist content matches the
   previous run (idempotent), log reports the same count
3. Manually delete a track in the Spotify client between runs → next sync
   restores it (since the playlist is wiped first)
