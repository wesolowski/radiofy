# [RDFY-014] Spotify OAuth — request playlist-read-private scope

## Type
bug

## Risk
medium

## Priority
high

## Status
in-progress

## Owner
implementer

## Background
The MVP target playlists are private Spotify playlists (the operator's personal "Radio Zet Weekly Playlist" etc.). The current OAuth scope set only requests `playlist-modify-public` + `playlist-modify-private`. According to the Spotify Web API documentation, `GET /v1/me/playlists` requires `playlist-read-private` to include private playlists in the response.

Consequence: `getPlaylistByName(...)` paginates the user's library and never finds the private target playlist, so the sync run fails with `PlaylistNotFoundError` even when the playlist exists in the user's account with the matching name.

The previous Rust prototype did not hit this because `rspotify` requests a broader default scope set including the read scopes.

## Symptom
- Operator creates a private playlist with the configured `playlistName`.
- `bun run sync --station=<id>` fails with `PlaylistNotFoundError("no playlist named '...' in the user's library")` even though the playlist exists.

## Scope
- **In scope**:
  - Add `playlist-read-private` to `SCOPES` in `packages/spotify/src/auth-flow.ts`
  - Update tests that assert on the requested scope set
  - Note in `docs/operations/runbook.md` that operators who already ran `bun run spotify:auth` before this fix need to delete `storage/auth/spotify.json` and re-authenticate so the new scope is granted
  - Update `PROJECT_ARCHITECTURE.md` "Spotify Authentication → Flow" if it lists the scopes (it does)
- **Out of scope (explicit)**: `playlist-read-collaborative` (collaborative playlists are not an MVP target); reading playlists owned by other users (not in MVP scope).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Spotify Authentication"
- Spotify Web API: https://developer.spotify.com/documentation/web-api/concepts/scopes#playlist-read-private
- `RDFY-006` (original OAuth ticket — this is the bug-fix follow-up)

## Acceptance Criteria
- [ ] `SCOPES` in `packages/spotify/src/auth-flow.ts` includes `playlist-read-private`
- [ ] `buildAuthRequest` test asserts the URL `scope` parameter contains `playlist-read-private`
- [ ] Runbook's "First-time setup" step mentions that the OAuth grant covers reading and writing both public and private playlists
- [ ] Runbook's "Recovery" section adds: "if your sync started failing with `PlaylistNotFoundError` after upgrading to a version newer than RDFY-014, delete `storage/auth/spotify.json` and re-run `bun run spotify:auth` so the new scope is granted"
- [ ] Architecture doc lists all three scopes in the Spotify Authentication section
- [ ] `bun test packages/spotify/test/` passes
- [ ] `bunx tsc --noEmit` and `bunx biome check .` clean

## Verification (manual)
1. Delete an existing `storage/auth/spotify.json`, run `bun run spotify:auth`, confirm the Spotify consent screen lists "Read your private playlists" alongside the modify permissions.
2. With a private target playlist created in Spotify, `bun run sync --station=<id>` finds it and replaces its contents.
