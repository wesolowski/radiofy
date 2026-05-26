# [RDFY-019] Persist rotated refresh_token on every refresh

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
Spotify rotates the `refresh_token` on every successful refresh for PKCE clients (since 2024). Our `performRefresh` in `packages/spotify/src/auth.ts` reads `access_token` and `expires_in` out of the response but ignores the new `refresh_token` field. The next refresh re-sends the now-invalid old refresh token, Spotify returns `400 invalid_grant`, and the worker surfaces `SpotifyAuthExpiredError` — forcing the operator to re-run `bun run spotify:auth` after the first refresh cycle.

The previous Rust prototype did not hit this because `rspotify`'s `token_refreshing: true` config automatically writes the rotated refresh token back to its cache file.

## Symptom
- Operator runs `bun run spotify:auth` once, the first `bun run sync` works.
- Some minutes / a process restart later, the next `bun run sync` exits 1 with `Spotify refresh token rejected — run \`bun run spotify:auth\` to re-authenticate.`

## Scope
- **In scope**:
  - In `packages/spotify/src/auth.ts → performRefresh`: capture `refresh_token` if present in the response and, when it differs from the currently stored one, persist it via `writeAuth(...)` with the same `scopes` / `client_id_hint` / fresh `obtained_at`.
  - Update the `RefreshResponse` interface to include the optional `refresh_token` field.
- **Out of scope (explicit)**: switching off PKCE (kept — security improvement from RDFY-006); migrating to a different cache file format; any auth changes outside of `performRefresh`.

## References
- `RDFY-006`, `RDFY-014`
- Spotify docs: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens

## Acceptance Criteria
- [ ] When `/api/token` returns a body containing `refresh_token`, the cached file is updated with the new value, the original `scopes` and `client_id_hint` preserved, and `obtained_at` set to the current ISO timestamp.
- [ ] When the response does **not** contain `refresh_token` (Spotify's standard AC flow), the file is left untouched.
- [ ] When the returned `refresh_token` is byte-identical to the stored one, no write happens (avoids unnecessary disk I/O).
- [ ] A subsequent refresh call reads the persisted new token from the file (covered by an explicit two-refresh-cycle test).
- [ ] Existing refresh tests still pass (caching, single in-flight refresh, 401 throws SpotifyAuthExpiredError).
- [ ] `bun test packages/spotify/test/auth.test.ts` passes
- [ ] `bunx tsc --noEmit`, `bunx biome check .` clean

## Verification (manual)
1. Delete `storage/auth/spotify.json`, run `bun run spotify:auth`.
2. Note the current `refresh_token` value in the file.
3. `bun run sync --station=radio-zet` → succeeds.
4. Run sync again **after** the access token expires (or call `resetAuthCache` manually) — the worker refreshes once and the on-disk `refresh_token` value should now differ from step 2.
5. Run sync a third time → still succeeds (proves the rotated token was persisted).
