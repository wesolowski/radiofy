# RDFY-008 — Spotify playlist discovery + replace

## Outcome
APPROVED. All thirteen acceptance criteria satisfied. Implementation matches the architecture's "Playlist Strategy" section. Risk-high review run adversarially — no blocking issues.

## What was implemented
- `packages/spotify/src/playlist.ts`
  - `getPlaylistByName(name, accessToken)` — paginates `GET /v1/me/playlists` (50 per page), stops on first matching page, returns first match. Multi-match on the same page emits a `warn` line. No match → `PlaylistNotFoundError`.
  - `getPlaylistTracks(playlistId, accessToken)` — paginates `GET /v1/playlists/{id}/tracks` (100 per page), preserves Spotify order, skips items where `track === null`, `track.id === null`, or `is_local === true` with a `debug` log. 404 → `PlaylistNotFoundError`.
  - `replacePlaylistTracks(playlistId, ids, accessToken)` — single atomic `PUT` for `0 < n <= 50`. Empty → `PlaylistEmptyError` with zero HTTP calls. Over-cap → `PlaylistOverCapError` with zero HTTP calls. Accepts bare IDs and pre-formatted `spotify:track:` URIs.
  - Typed errors: `PlaylistNotFoundError`, `PlaylistEmptyError`, `PlaylistOverCapError` (exposes `cap` and `received`).
  - `PLAYLIST_TRACK_CAP = 50` exported.
- `packages/spotify/src/index.ts` — barrel exports for the new symbols.
- 429/5xx retry behaviour delegated to the shared `spotifyFetch` layer (already covered by RDFY-007 `http.test.ts`).

## Files changed
- `packages/spotify/src/playlist.ts` (new)
- `packages/spotify/src/index.ts` (re-exports added)
- `packages/spotify/test/playlist.test.ts` (new, 13 tests)

## Quality gate
- `bun test packages/spotify/test/playlist.test.ts` → 13 pass / 0 fail / 22 expectations
- `bunx biome check packages/spotify/src/playlist.ts packages/spotify/test/playlist.test.ts` → clean
- `bunx tsc --noEmit -p packages/spotify/tsconfig.json` → clean
- `.claude/hooks/confidentiality-check.sh` → exit 0
- `grep -r "drizzle\|@radiofy/database" packages/spotify/` → zero hits
- No inline comments, no `any`, no `@ts-ignore`, no `process.env` in new source

## Adversarial review (Risk: high)
- **Cap boundary:** constant is exactly 50; over-cap test uses 51. Confirmed.
- **Wrong-playlist write:** `getPlaylistByName` matches on exact `name === arg` only; first-match-wins is deterministic.
- **Empty playlist accident:** `PlaylistEmptyError` thrown before any HTTP call; verified by test that asserts `called === false`.
- **No DB coupling:** zero Drizzle / `@radiofy/database` imports; package stays a thin Spotify wrapper.
- **Confidentiality:** no Claude/AI/LLM references in diff.

## Follow-ups (advisory, not blocking)
- Defensive parsing of `body.items` / `body.next` / `body.snapshot_id` — current code assumes Spotify's contract; on a malformed response it throws `TypeError` rather than a typed error. Fail-loud is acceptable for v1 but worth a schema layer once Zod is introduced.
- `id.startsWith('spotify:track:')` does not reject `spotify:episode:` URIs. Ticket explicitly defers richer URI validation.
- `playlist_sync_runs` audit row owned by RDFY-011 as planned — out of scope here.
