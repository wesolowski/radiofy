# RDFY-019 — Persist rotated refresh_token on every refresh

## Result
Done. PR #21 approved by reviewer.

## What was done
- `performRefresh` in `packages/spotify/src/auth.ts` now captures the optional `refresh_token` from the `/api/token` response.
- When the response carries a non-empty `refresh_token` that differs from the stored one, the auth file is rewritten via `writeAuth` with the original `scopes` and `client_id_hint` preserved and a fresh `obtained_at` ISO timestamp.
- Empty-string and identical `refresh_token` values are treated as "no rotation" — file is left untouched (mtime stable).
- `RefreshResponse` interface extended with optional `refresh_token?: string`.

## Files changed
- `packages/spotify/src/auth.ts`
- `packages/spotify/test/auth.test.ts`

## Acceptance criteria
- [x] Rotated `refresh_token` persisted with scopes / client_id_hint preserved and fresh `obtained_at`.
- [x] Response without `refresh_token` leaves the file untouched.
- [x] Byte-identical `refresh_token` triggers no write (mtime test).
- [x] Two-cycle test proves the persisted token is reused on the next refresh.
- [x] Existing refresh tests (caching, single in-flight, 400/401, missing file) still pass.

## Quality gate
- `bunx tsc --noEmit` — clean
- `bunx biome check packages/spotify/src/auth.ts packages/spotify/test/auth.test.ts` — clean
- `bun test packages/spotify/test/auth.test.ts` — 9 pass / 0 fail

## Reviewer notes
- Confidentiality hook dry-run: no Claude/AI/LLM references in code, tests, commit, or PR.
- Empty-string adversarial case explicitly guarded (`json.refresh_token !== ''`).
- Crash-between-fetch-and-write trade-off accepted: leaves system in the same state as before the call (old refresh token still on disk, still valid until the next successful Spotify rotation overwrites it). No worse than pre-ticket behaviour.
- `writeAuth` is synchronous and currently propagates filesystem errors — chosen behaviour: surface storage failures rather than silently caching an access token whose refresh token is now lost. Acceptable.
- Unrelated working-tree change in `config/stations.json` is local operator data, not part of commit `8c5a7fc` or PR #21.
