# [RDFY-020] prune-plays command — delete old plays from DB

## Type
feature

## Risk
medium

## Priority
medium

## Status
in-progress

## Owner
implementer

## Background
The `plays` table grows by ~200-300 rows per station per day forever. Without housekeeping the local SQLite database fills up; for 4 stations that's ~350k rows per year (~30 MB). Sync only needs the rolling 7-day window, so anything older than ~30 days is dead weight for the worker. Top-played queries still work against whatever range is on disk, so the operator can choose how much history to keep.

`prune-audit` already exists for `crawl_runs` / `playlist_sync_runs`; this ticket adds the same pattern for `plays`.

## Scope
- **In scope**:
  - `packages/database/src/repos/plays.ts`: `countOlderThan(db, cutoffIso): number` and `deleteOlderThan(db, cutoffIso): number`.
  - `apps/worker/lib/prune-plays.ts`: `runPrunePlays(options)` — same shape as `runPruneAudit` from RDFY-012. Default `--keep-days=30`. `--dry-run` prints the count only.
  - `apps/worker/commands/prune-plays.ts`: thin CLI wrapper.
  - Root `package.json` script: `"prune-plays": "bun apps/worker/commands/prune-plays.ts"`.
  - Update `docs/operations/cron/crontab.example`: add a monthly `prune-plays` line next to the existing `prune-audit`.
  - Update README CLI table and runbook "Monthly housekeeping" section to mention the new command.
- **Out of scope (explicit)**: Pruning `songs` rows (size is negligible; orphan-song rows are harmless and may still be referenced by future plays); pruning `spotify_matches` (one row per song, also negligible); pruning resolved `unmatched_songs` (separate concern); soft-deletes / archival; row counts above ~10k per call are fine but no special bulk-delete tuning.

## References
- `RDFY-012` (the `prune-audit` precedent)
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Database Strategy", "Time Semantics"

## Acceptance Criteria
- [ ] `playsRepo.countOlderThan(db, cutoffIso)` returns the number of `plays` rows where `played_at < cutoffIso`
- [ ] `playsRepo.deleteOlderThan(db, cutoffIso)` deletes those rows and returns the count actually deleted
- [ ] `bun run prune-plays --dry-run` prints the would-be-deleted count and writes nothing
- [ ] `bun run prune-plays` deletes plays older than 30 days by default; `--keep-days=N` overrides
- [ ] `bun run prune-plays --keep-days=0` rejects with exit 1 (don't allow accidental "delete everything")
- [ ] Cron example has a monthly `prune-plays --keep-days=30` entry
- [ ] README CLI table and runbook list the new command
- [ ] `bun test apps/worker/test/`, `bunx tsc --noEmit`, `bunx biome check .` all clean

## Verification (manual)
1. Seed plays with a mix of recent and old timestamps.
2. `bun run prune-plays --dry-run` shows the right count; SELECT COUNT(*) on `plays` is unchanged.
3. `bun run prune-plays` deletes the old ones; only recent plays remain.
4. `bun run top-played --since=2026-04-01` still works for the kept window.
