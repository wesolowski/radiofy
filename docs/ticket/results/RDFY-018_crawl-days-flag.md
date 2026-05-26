# RDFY-018 — crawl: --days=N flag for multi-day backfill

## Result
APPROVED — merged to `done`.

## What was done
- `apps/worker/lib/cli-args.ts`: added `--days` parsing behind `allowDays` flag with validation (`1..31`, integer only).
- `apps/worker/lib/crawl.ts`: added `resolveDays` + per-day `crawlOneDay` loop; each day opens and closes its own `crawl_runs` audit row. Concurrency guard runs once per station.
- `apps/worker/commands/crawl.ts`: enables `allowDays`, warns and drops `--days` when `--day` is also provided.
- README and `docs/operations/runbook.md`: documented `--days=N` and the override rule.

## Files changed
- `apps/worker/lib/cli-args.ts`
- `apps/worker/lib/crawl.ts`
- `apps/worker/commands/crawl.ts`
- `apps/worker/test/cli-args.test.ts`
- `apps/worker/test/crawl.test.ts`
- `README.md`
- `docs/operations/runbook.md`

## Acceptance Criteria
- [x] `--days=7` runs 7 sequential days ending yesterday, each with its own `crawl_runs` row.
- [x] `--days=1` equivalent to the no-flag default.
- [x] `--day` + `--days` → `--day` wins, warning logged.
- [x] `--days=99` exits with validation error.
- [x] `--days=abc` exits with validation error.
- [x] No-flag default unchanged (yesterday only).
- [x] README and runbook updated.

## Quality Gate
- `bunx tsc --noEmit`: clean.
- `bunx biome check` on changed files: clean.
- `bun test apps/worker/test/cli-args.test.ts apps/worker/test/crawl.test.ts`: 18 pass, 0 fail.
