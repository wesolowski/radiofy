# [RDFY-014] Spotify OAuth — request playlist-read-private scope — Result

## Outcome
APPROVED. Ticket moved `review → done`.

## What was done
- Added `playlist-read-private` to the OAuth `SCOPES` constant so `GET /v1/me/playlists` returns the operator's private target playlists during name-based discovery.
- Extended the auth-flow unit test to assert all three scopes appear on the consent URL.
- Documented the three-scope set with per-scope justification in the architecture doc's Spotify Authentication section.
- Updated the runbook's first-time setup to state that read + write access to both public and private playlists is requested at consent time.
- Added a Recovery entry instructing operators upgrading past RDFY-014 to delete `storage/auth/spotify.json` and re-run `bun run spotify:auth` so the new scope is granted.

## Files changed
- `packages/spotify/src/auth-flow.ts`
- `packages/spotify/test/auth-flow.test.ts`
- `docs/architecture/PROJECT_ARCHITECTURE.md`
- `docs/operations/runbook.md`

## Verification
- `bun test packages/spotify/test/` — 72 pass, 0 fail.
- `bunx tsc --noEmit` — clean.
- `bunx biome check` on changed files — clean.
- Confidentiality hook on branch diff — exit 0.
- Refresh flow inspected: no `scope` field is sent on `grant_type=refresh_token`, so Spotify keeps the original grant's scope set. Pre-RDFY-014 tokens continue to refresh; operators must re-consent only to gain the new read scope (covered by the runbook entry). No extra scopes were introduced beyond the three named in the ticket.

## Notes
- The unrelated `config/stations.json` working-tree change was not part of this ticket and remains unstaged.
