# RDFY-006 — Spotify authentication (PKCE + state + refresh-token storage)

**Status**: done
**Reviewer decision**: APPROVED
**Branch**: `rdfy-006-spotify-auth`
**PR**: https://github.com/wesolowski/radiofy/pull/6

## What was delivered

- `packages/spotify/src/pkce.ts` — `generateVerifier()` (64 random bytes → base64url, ≥ 43 chars), `generateChallenge(v)` = `base64url(sha256(v))`, `generateState()` (32 random bytes → base64url).
- `packages/spotify/src/auth-flow.ts` — `buildAuthRequest()` assembles the Spotify `/authorize` URL with `response_type=code`, `scope=playlist-modify-public playlist-modify-private`, `state`, `code_challenge_method=S256`, `code_challenge`. `exchangeCode({ code, verifier })` POSTs to `/api/token` with `code_verifier` and Basic auth.
- `packages/spotify/src/auth-callback-server.ts` — `startCallbackServer(port, expectedState)` on `127.0.0.1`. Handles `/callback` only; non-matching state → HTTP 400 + `{kind:'error'}`; missing code → HTTP 400 + `{kind:'error'}`; other paths → 404.
- `packages/spotify/src/auth-storage.ts` — `writeAuth` with `mkdirSync(... recursive)` + `writeFileSync(..., { mode: 0o600 })` + explicit `chmodSync(path, 0o600)` to harden pre-existing files. `readAuth` returns `null` on any read/parse failure.
- `packages/spotify/src/auth.ts` — `getAccessToken()` with per-process `cachedToken` (expires_in minus 60s safety) and a `refreshInFlight` promise that coalesces concurrent calls; cleared in `.finally`. 400/401 from the refresh endpoint → `SpotifyAuthExpiredError`.
- `packages/spotify/src/errors.ts` — `SpotifyAuthExpiredError` (actionable default message) and `SpotifyTransientError`.
- `apps/worker/commands/spotify-auth.ts` — CLI: prints consent URL, awaits the callback on `127.0.0.1:8888`, exchanges the code, persists `{ refresh_token, scopes, obtained_at, client_id_hint }`. Exits 1 on callback errors.

## Files changed

- `apps/worker/commands/spotify-auth.ts`
- `apps/worker/package.json`
- `bun.lock`
- `docs/ticket/backlog/done/RDFY-006_spotify-authentication.md` (moved from `review/`)
- `packages/spotify/package.json`
- `packages/spotify/src/auth-callback-server.ts` (new)
- `packages/spotify/src/auth-flow.ts` (new)
- `packages/spotify/src/auth-storage.ts` (new)
- `packages/spotify/src/auth.ts` (new)
- `packages/spotify/src/errors.ts` (new)
- `packages/spotify/src/index.ts`
- `packages/spotify/src/pkce.ts` (new)
- `packages/spotify/test/auth-callback-server.test.ts` (new)
- `packages/spotify/test/auth-flow.test.ts` (new)
- `packages/spotify/test/auth-storage.test.ts` (new)
- `packages/spotify/test/auth.test.ts` (new)
- `packages/spotify/test/pkce.test.ts` (new)

## Acceptance criteria

- [x] `bun run spotify:auth` boots, prints the consent URL, listens on `127.0.0.1:8888/callback`, captures the code, persists the file; fails fast via `loadConfig` when `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are absent
- [x] File mode after write is `0o600` (asserted via `statSync(...).mode & 0o777`)
- [x] Persisted JSON contains exactly `refresh_token`, `scopes`, `obtained_at`, `client_id_hint` (last 4 chars only); no `client_secret` anywhere (asserted)
- [x] Auth URL `state` is base64url ≥ 43 chars; `code_challenge` present with `code_challenge_method=S256`
- [x] Token exchange sends matching `code_verifier`
- [x] Callback rejects mismatched / missing `state` with HTTP 400 and resolves to `kind:'error'`; CLI exits with code 1
- [x] `getAccessToken()` caches per process: sequential calls = 1 fetch; concurrent calls = 1 fetch (in-flight coalescing)
- [x] 400/401 from the refresh endpoint throws `SpotifyAuthExpiredError` with the actionable hint

## Quality gate

- Biome: clean (`bunx biome check packages/spotify apps/worker/commands/spotify-auth.ts` — 15 files, no fixes)
- TypeScript: clean (`bunx tsc --noEmit -p packages/spotify` and `-p apps/worker` — exit 0)
- Tests: 25 pass / 0 fail across 5 spotify files; full repo 114 pass / 0 fail across 17 files

## Notes / follow-ups (non-blocking)

- The refresh path throws `SpotifyAuthExpiredError` on the very first 400/401 from `/api/token`. The ticket text mentions "two consecutive 401s", but that pattern (refresh once, retry the resource call) belongs to the resource-call layer that is explicitly out of scope here — a 401 from the refresh endpoint itself means the refresh token is dead, so retrying is pointless. The error message is already actionable.
- `auth-storage.test.ts` has a vestigial `const raw = Bun.file(path)` assertion and a `require('node:fs')` import in an otherwise ESM file. Cosmetic only — Biome stays silent, the assertion passes.
- `writeAuth` is correct against a pre-existing wider-permission file thanks to the explicit `chmodSync`. No test exercises that path; a one-line regression test would be cheap to add later.
