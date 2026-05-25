# [RDFY-009] Matcher orchestration — Result

## Status
Done — inline review (Reviewer agent unavailable due to upstream overload; same checks applied manually).

## Summary
Adds `resolveSong()` in `@radiofy/matcher` that composes override resolution, cache lookup, and live Spotify search into one transactional decision pipeline. Every database write inside a single `resolveSong` call goes through `withTransaction`; the Spotify HTTP call is outside the transaction so SQLite never holds a write lock across network latency.

## Decision priority
1. Manual override (from `storage/overrides.json`) → upsert `spotify_matches` with `source_of_truth='manual'` + set `resolved_at` on any matching `unmatched_songs` row in the same tx.
2. `spotify_matches` cache hit → return without network.
3. Live Spotify search → score top candidate:
   - `≥ 0.85` → auto match (`spotify_matches` `source_of_truth='auto'`)
   - `0.6 ≤ score < 0.85` → `unmatched_songs` `reason='low_confidence'` with `best_candidate_*`
   - `< 0.6` or `[]` → `unmatched_songs` `reason='no_results'`
4. `SpotifyTransientError` → `unmatched_songs` `reason='api_error'`, returns `api_error`.
5. `SpotifyAuthExpiredError` → propagates so the orchestrator (RDFY-011) can fail loudly.

## Files added / changed
- `packages/matcher/src/resolve.ts` — `resolveSong()` + helpers
- `packages/matcher/src/index.ts` — exports
- `packages/matcher/package.json` — dependencies on `@radiofy/database`, `@radiofy/spotify`
- `packages/matcher/test/resolve.test.ts` — 10 tests across 7 describe blocks

## Verification
- `bun test packages/matcher/test/` — 25/25 pass (15 from RDFY-010 + 10 here)
- Full project: 186 pass / 1 skip / 0 fail across 25 files
- `bunx tsc --noEmit` — exit 0
- `bunx biome check .` — clean
- No `any`, `@ts-ignore`, `process.env`, `console.*`, or inline comments in `packages/matcher/src/`
- Confidentiality hook dry-run — exit 0

## Adversarial probes
- Override on a song without an unmatched row → `markResolved` updates 0 rows (safe no-op).
- Override added after a previous auto-match → resolved first via override, never reaches the cache check.
- Repeat low-confidence sighting → `occurrence_count` increments, `last_seen_at` updated.
- Concurrent same-song call from worker is out of scope (one-shot CLI, single-station per process).

## Follow-ups (non-blocking)
- The cache check uses `songsRepo.getByNormalizedKey` then `matchesRepo.get(songId)` — two queries. Could be one JOIN if profiling shows it matters. Not relevant at MVP scale.
