# RDFY-024 Crawl defaults to the last 7 days

## Type
feature

## Risk
low

## Priority
medium

## Status
done

## Owner
implementer

## Background
Running `bun run crawl` without a day range only ingested the previous day.
Operators expect a plain crawl to cover a full week so the rolling weekly
playlists always have a complete window behind them, without having to pass a
flag on every run. A one-day default meant a single missed run left a gap.

## Scope
- **In scope**: change the default day range of `crawl` from 1 day to the last
  7 days when neither `--day` nor `--days` is given. `--day=YYYY-MM-DD` and
  `--days=N` keep their current meaning; `--day` still overrides `--days`.
- **Out of scope (explicit)**: no change to `sync`, to the per-day crawl logic,
  or to the `--days` upper bound.

## References
- `apps/worker/lib/crawl.ts`
- `README.md`

## Acceptance Criteria
- [ ] `runCrawl` without `day`/`days` crawls the 7 days ending yesterday
      (`daysCrawled === 7`).
- [ ] `runCrawl` with `days: 1` still crawls yesterday only.
- [ ] `runCrawl` with `day: <date>` still crawls exactly that day.
- [ ] `bun test apps/worker` passes.

## Verification (manual)
1. `bun run crawl --station=zet` → fetches yesterday and the six days before it.
2. `bun run crawl --station=zet --days=1` → fetches yesterday only.
3. `bun run crawl --station=zet --day=2026-05-24` → fetches 2026-05-24 only.
