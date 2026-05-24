# [RDFY-006] Spotify authentication — refresh token flow + CLI bootstrap

## Type
feature

## Risk
medium

## Priority
high

## Status
todo

## Owner
implementer

## Background
Playlist writes require user-level OAuth. Without a working refresh-token flow no later ticket can interact with Spotify. The flow is interactive on first run and silent thereafter.

## Scope
- **In scope**:
  - `packages/spotify/auth.ts`: `getAccessToken()` reads `storage/auth/spotify.json`, refreshes against Spotify, returns a token + expiry. Cache is per process invocation (worker is one-shot CLI — at most one refresh per process).
  - `apps/worker/commands/spotify-auth.ts`: CLI command that boots a local HTTP server at `127.0.0.1:8888/callback`, prints the consent URL, captures the code, exchanges it, writes `storage/auth/spotify.json` with mode `0600`
  - **CSRF protection**: the auth-request URL includes a cryptographically random `state` parameter (32 bytes, base64url). The callback handler rejects mismatched / missing `state` with HTTP 400 and exits the process with code 1.
  - **PKCE (S256)**: random code verifier (43–128 chars, RFC 7636), SHA-256 hashed `code_challenge` sent on the auth request, raw verifier sent on the token exchange. Spotify supports PKCE on the loopback flow.
  - Scopes: `playlist-modify-public playlist-modify-private`
  - 401 handling: refresh once and retry; on second 401 throw a typed `SpotifyAuthExpiredError` with a clear hint to re-run `bun run spotify:auth`
- **Out of scope (explicit)**: any playlist/search calls, any persistence other than the auth file, any token rotation/revoke automation, cross-process token caching.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Spotify Authentication"
- `RDFY-001`, `RDFY-002`

## Acceptance Criteria
- [ ] `bun run spotify:auth` opens the consent URL, captures the redirect, writes the file
- [ ] File mode after write is `0600`
- [ ] File contains `refresh_token`, `scopes`, `obtained_at`, `client_id_hint` (last 4 chars of client id only) — never the client secret
- [ ] Generated auth URL contains a `state` query param of >= 32 random bytes base64url-encoded
- [ ] Generated auth URL contains `code_challenge` and `code_challenge_method=S256`; the token exchange sends the matching `code_verifier`
- [ ] Callback handler with a missing or mismatched `state` returns HTTP 400 and the CLI exits with code 1 (covered by an integration test that fires a hand-crafted bad callback)
- [ ] `getAccessToken()` returns a token valid for at least 5 minutes; subsequent calls **within the same process** do not hit Spotify
- [ ] Each new CLI invocation does at most one refresh request (no cross-process cache)
- [ ] Two consecutive 401s throw `SpotifyAuthExpiredError` with a hint to re-run `bun run spotify:auth`

## Verification (manual)
1. `bun run spotify:auth` against a real Spotify dev app → file appears in `storage/auth/`, content readable, mode `-rw-------`
2. Delete the access-token cache in memory, call any function that needs the token → exactly one network request to `/api/token`
3. Tamper with the refresh token, call again → `SpotifyAuthExpiredError` thrown with actionable message
