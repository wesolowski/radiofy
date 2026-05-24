# [RDFY-002] Shared package — Result

## Status
Done — approved on review.

## Summary
Added the cross-cutting `@radiofy/shared` package: structured JSON logger with per-run file binding, env + `stations.json` loader (Zod-validated, single source of `process.env` access), shared domain types, and `date-fns-tz`-backed time utilities. The placeholder bootstrap test was replaced with full unit coverage. All 24 tests pass; tsc and biome are clean.

## Files added / changed
- `packages/shared/src/logger.ts` — JSON line logger, `bindRunFile` truncates and recursive-mkdirs, `unbindRunFile`, `resetLevelCache`.
- `packages/shared/src/config.ts` — `loadConfig`, `loadLogLevel`, `loadStations`; Zod schemas; only file in repo reading `process.env`.
- `packages/shared/src/types.ts` — `Station`, `RawSong`, `NormalizedSong`, `AppConfig`, `Level`, `SourceTrackId`, `SpotifyTrackId`.
- `packages/shared/src/date.ts` — `toUtc`, `toZoned`, `utcIsoNow`, `rollingWeekWindow`, `UtcWindow`.
- `packages/shared/src/index.ts` — public surface re-exports.
- `packages/shared/test/{logger,config,date,types}.test.ts` — full coverage including DST forward/backward jumps for Europe/Warsaw (March + October 2026).
- `packages/shared/test/bootstrap.test.ts` — removed (placeholder replaced as planned).
- `packages/shared/package.json`, `bun.lock` — `date-fns@^4.1.0`, `date-fns-tz@^3.2.0`, `zod@^3.23.8`.

## Verification
- `bun test packages/shared/test/` → 24 pass, 0 fail.
- `bunx tsc --noEmit` (root and package) → exit 0; strict + `exactOptionalPropertyTypes` hold.
- `bunx biome check packages/shared/` → no issues.
- `grep -rn 'process\.env\|Bun\.env' packages/ apps/` → only `packages/shared/src/config.ts`.
- `LOG_LEVEL=debug bun -e "...logger.info('hi')"` → single valid JSON line on stdout.
- `loadConfig({ SPOTIFY_CLIENT_SECRET: 'x' })` → throws `env.SPOTIFY_CLIENT_ID: Required`.
- `loadStations` with a missing `source` field → throws `stations[0].source: Required`.
- Divergence check: adding a required field to `Station` makes tsc fail on `StationSchema` — the explicit `z.ZodType<Station>` annotation pins the schema to the interface.
- `date-fns-tz@3.2.0` exports `fromZonedTime` / `toZonedTime` (not the deprecated `zonedTimeToUtc` / `utcToZonedTime`) — implementation matches installed version.
- Confidentiality pre-tool hook: dry-run with `git commit` payload → no hits (exit 0).

## Notes
- `loadLogLevel` silently falls back to `info` on a malformed `LOG_LEVEL`. Considered as a reviewer point; the implementer's policy — never let logging itself crash the worker — is reasonable for an internal CLI and is covered by an explicit test. If we ever want to warn on typos, that's a follow-up, not a blocker for this ticket.
