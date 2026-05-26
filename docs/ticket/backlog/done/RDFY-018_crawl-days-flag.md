# [RDFY-018] crawl: add --days=N flag for multi-day backfill

## Type
feature

## Risk
low

## Priority
medium

## Status
in-progress

## Owner
implementer

## Background
Today `bun run crawl --station=<id>` (no flags) crawls only yesterday. That's the right default for cron. But after a fresh setup or a multi-day outage the operator wants a single command that backfills the rolling 7-day window in one go — currently they would have to loop manually.

## Scope
- **In scope**:
  - `apps/worker/lib/cli-args.ts`: accept `--days=<N>` alongside the existing `--day` and `--station`. Validate that `--days` is a positive integer <= 31. Rejects non-numbers.
  - `apps/worker/lib/crawl.ts`: when `--days=N` is provided, loop `N` days back from "yesterday" (inclusive) and run the existing single-day crawl logic for each. Each day still opens / closes its own `crawl_runs` audit row.
  - When both `--day` and `--days` are passed, `--day` wins for a single specific day (`--days` ignored, log a warning).
  - When neither is passed, behaviour is unchanged (yesterday only).
  - Default cron behaviour is preserved — the existing crontab.example does not need editing.
  - Update README and runbook to mention the new flag once.
- **Out of scope (explicit)**: changing the default to a full week (intentionally kept at 1 day so the cron remains cheap); any concurrent crawl-runs parallelisation (each day runs sequentially); any logic that decides which days have data — the worker just runs N days and lets the source/UNIQUE constraint sort it out.

## References
- `apps/worker/lib/crawl.ts`
- `apps/worker/lib/cli-args.ts`
- `RDFY-011` (the original crawl + sync ticket)

## Acceptance Criteria
- [ ] `bun run crawl --station=radio-zet --days=7` runs the crawl pipeline once per day for the seven days ending yesterday, sequential, each with its own `crawl_runs` row
- [ ] `bun run crawl --station=radio-zet --days=1` is equivalent to the no-flag default (yesterday only)
- [ ] `bun run crawl --station=radio-zet --day=2026-05-25 --days=7` crawls only 2026-05-25, prints a warning that `--days` was ignored
- [ ] `bun run crawl --station=radio-zet --days=99` exits `1` with `--days must be a positive integer ≤ 31`
- [ ] `bun run crawl --station=radio-zet --days=abc` exits `1`
- [ ] Cron-style default (no flags) still crawls yesterday only
- [ ] `bun test`, `bunx tsc --noEmit`, `bunx biome check .` clean
- [ ] README CLI table and runbook setup section mention `--days` once

## Verification (manual)
1. With an empty db, `bun run crawl --station=radio-zet --days=7` produces 7 `crawl_runs` rows (one per day), each with `finished_at IS NOT NULL`.
2. `bun run top-played --station=radio-zet` shows the rolling-week chart immediately afterwards.
