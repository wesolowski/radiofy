# [RDFY-011] Worker CLI — `crawl` and `sync` — Result

## Status
APPROVED — moved to `done`.

## Summary
End-to-end pipeline delivered. Both `bun run crawl --station=<id> [--day=YYYY-MM-DD]` and `bun run sync --station=<id>` are operational. Drizzle migrations auto-apply at startup; audit rows in `crawl_runs` / `playlist_sync_runs` are opened pre-side-effect and closed with `finished_at` + counts or `error`. Overlap protection blocks concurrent runs within 5 min (exit 2) and overrides crashed runs older than that. Sync builds URIs in-memory, dedupes by resolved `spotify_track_id`, sorts by play count then `last_seen_at` desc, caps at 50, only then resolves the playlist by name and calls `replacePlaylistTracks`. PUT is the last side effect — if anything earlier throws, Spotify is untouched.

## Files Changed
- `apps/worker/commands/{crawl,sync}.ts` — CLI entry points, exit-code mapping
- `apps/worker/lib/{crawl,sync,cli-args,station-loader,yesterday}.ts` — pipeline logic
- `apps/worker/test/{crawl,sync,cli-args,station-loader}.test.ts` — 22 tests, all green
- `packages/database/src/repos/plays.ts` — `findResolutionInputsInWindow` query (GROUP BY `songs.id, plays.source`, ORDER BY play count desc / last seen desc)
- `packages/database/src/index.ts` — export `ResolutionInput`
- `apps/worker/package.json`, `bun.lock` — runtime deps

## Acceptance Criteria
All 13 ticket ACs verified — migrations-before-audit, fixture parsing, idempotent re-crawl, getPlaylistByName→replacePlaylistTracks order, PlaylistNotFoundError handling, GROUP BY post-matcher dedup, zero-resolvable no-op, audit row contract, overlap exit 2, crash override, disabled station exit 0, missing station exit 1, log-file truncation, PUT-last transactional guarantee.

## Adversarial Review (HIGH risk)
External Codex review unavailable. Self-conducted adversarial pass confirmed:
- PUT is unreachable with empty list (empty check at uris.length===0 before name lookup).
- SpotifyAuthExpiredError propagates through `resolveSong`; outer `runSync` catch closes the run row before re-throw.
- `applyMigrations` runs before any audit row open — failure leaves no orphan row.
- GROUP BY `(songs.id, plays.source)` is correct; client-side `resolved` map aggregates across sources by resolved `spotify_track_id`.
- Override-only songs persist as `source_of_truth='manual'` and are served from cache on subsequent calls.
- Non-UNIQUE play insert errors logged as warn; UNIQUE silently ignored to preserve idempotency.
- Exit codes correct: 0 / 1 (unrecoverable, not_found, playlist_not_found) / 2 (blocked).

Residual risk: the `findOpen → open` overlap check is not protected by a unique partial index — best-effort only. Acceptable for single-host scheduler; documented intent.

## Quality Gate
- `bun test apps/worker/test/` — 22/22 pass, 36 expect() calls, 422ms
- `bunx tsc --noEmit` — clean
- `bunx biome check .` — 100 files, no findings
- `bun run --filter '*' build` — all 7 packages exit 0
- Confidentiality hook — exit 0
- No `any`, no `@ts-ignore`, no inline comments, no `process.env` outside `packages/shared/src/config.ts`
