# RDFY-024 Crawl defaults to the last 7 days — Result

## Status
done

## What was done
Changed the default day range of `bun run crawl` from 1 day to the last 7 days
when neither `--day` nor `--days` is given. A new `DEFAULT_DAYS = 7` constant
backs `resolveDays`, which now uses `options.days ?? DEFAULT_DAYS`. `--day` and
`--days=N` keep their meaning, and `--day` still overrides `--days`. No change
to `sync` or to the per-day crawl logic.

## Files changed
- `apps/worker/lib/crawl.ts` — added `DEFAULT_DAYS = 7`; `resolveDays` defaults
  to it instead of `1`.
- `apps/worker/test/crawl.test.ts` — renamed the misleading
  "--days=1 (default)" test to "--days=1 crawls yesterday only"; added a test
  asserting the implicit default crawls the 7 days ending yesterday
  (`daysCrawled === 7`, distinct days 2026-05-19..2026-05-25).
- `README.md` — documented the new 7-day default.
- `docs/operations/runbook.md` — updated wording to the default last-7-days
  behaviour.

## Acceptance criteria
- [x] `runCrawl` without `day`/`days` crawls the 7 days ending yesterday
      (`daysCrawled === 7`).
- [x] `runCrawl` with `days: 1` still crawls yesterday only.
- [x] `runCrawl` with `day: <date>` still crawls exactly that day.
- [x] `bun test apps/worker` passes.

## Verification
- `bunx tsc --noEmit` — clean.
- `bun test apps/worker` — 69 pass, 0 fail (123 assertions).
- `bunx biome check` on both changed source files — no fixes needed.

## Review notes
- Risk is low; no external review required.
- Logic confirmed: with `now` at 2026-05-26, the default range resolves to
  2026-05-19..2026-05-25 (ascending), 7 distinct days.
- No documentation still claims a "yesterday only" default. Remaining
  "yesterday only" mentions belong to the historical RDFY-018 ticket/result and
  to this ticket's own `--days=1` description, all of which are correct.
- Pre-existing uncommitted change in `config/stations.json` is unrelated to this
  ticket and was left untouched.
