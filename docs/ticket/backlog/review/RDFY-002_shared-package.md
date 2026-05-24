# [RDFY-002] Shared package — logger, config loader, types, date utilities

## Type
feature

## Risk
low

## Priority
high

## Status
todo

## Owner
implementer

## Background
Cross-cutting utilities are needed by every other package. Centralizing them in `packages/shared/` prevents accidental drift and keeps `process.env` access in one place, as required by the architecture's "Configuration" section.

## Scope
- **In scope**:
  - `logger.ts`: structured JSON logging to **both stdout and a per-run file**. `LOG_LEVEL` honored, fields include `level`, `msg`, `station?`, `run_id?`. File path is determined by the caller via `logger.bindRunFile(path)` — the worker passes `storage/logs/<command>-<station>.log`. **The file is truncated (opened with `w` flag) at the start of each run** so only the most recent invocation is kept. Stdout output is never truncated.
  - `config.ts`: typed loader for env vars (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `LOG_LEVEL`) and for `config/stations.json`. **All `process.env` / `Bun.env` access lives in this file — every other package imports the typed object.** Fails loudly on missing required vars.
  - `types.ts`: shared domain types (`Station`, `RawSong`, `NormalizedSong`, `SourceTrackId`, `SpotifyTrackId`)
  - `date.ts`: helpers for Europe/Warsaw → UTC ISO-8601 conversion and rolling-7-day window calculation. **Uses `date-fns-tz`** (`zonedTimeToUtc`, `utcToZonedTime`) — small, mature, treeshakable. Pinned in `package.json` dependencies.
- **Out of scope (explicit)**: any reading from the database, any Spotify call, any HTTP client, log rotation (truncate-on-start is the policy — no rotation, no compression, no history beyond last run).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Configuration", "Time Semantics"
- `RDFY-001` (must be done first)

## Acceptance Criteria
- [ ] `logger.info("crawl started", { station: "radio-zet" })` emits a single line of valid JSON to stdout
- [ ] After `logger.bindRunFile("/tmp/x.log")` followed by two `logger.info(...)` calls, the file contains exactly two lines (truncated on bind, then appended)
- [ ] Re-binding the same path truncates again — only the most recent invocation's lines remain
- [ ] If the bound file's parent directory does not exist, `bindRunFile` creates it (recursive mkdir)
- [ ] `loadConfig()` returns a typed object; missing `SPOTIFY_CLIENT_ID` throws with a message naming the variable
- [ ] `loadStations()` parses `config/stations.json` against a Zod (or hand-written) validator and rejects entries missing required fields
- [ ] `toUtc(date, "Europe/Warsaw")` and `rollingWeekWindow(now)` have unit tests covering DST transitions (forward jump end of March, backward jump end of October)
- [ ] No `process.env` / `Bun.env` access outside `config.ts` — verified with `grep -r 'process\.env\|Bun\.env' packages/ apps/` returning hits only in `packages/shared/src/config.ts`
- [ ] `bun test packages/shared/test/` passes
- [ ] No `any`, no `// @ts-ignore`

## Verification (manual)
1. `LOG_LEVEL=debug bun -e "import { logger } from './packages/shared/src/logger'; logger.info('hi')"` → one JSON line on stdout
2. Run with `SPOTIFY_CLIENT_ID` unset → process exits non-zero with the variable name in the error
3. Edit `config/stations.json` to remove a required field → `loadStations()` throws with a precise path (e.g. `stations[0].source`)
