# RDFY-023 Crawl and sync all stations when --station is omitted

## Type
feature

## Risk
low

## Priority
medium

## Status
review

## Owner
implementer

## Background
Operating the worker means running the same command once per station. A daily
crawl or weekly sync therefore needs one scheduled job per station, and adding a
station means editing every scheduler entry. Operators want a single invocation
that processes every enabled station in one pass, while still being able to
target a single station when needed.

## Scope
- **In scope**: make `--station` optional for `bun run crawl` and `bun run sync`.
  When omitted, iterate over every enabled station from `config/stations.json`.
  Keep single-station behavior when `--station=<id>` is passed. Batch runs
  continue past a failing station and exit non-zero if any station failed.
- **Out of scope (explicit)**: other commands (`export-unmatched`, `status`,
  `prune-*`, `top-played`, `overrides-validate`) keep requiring `--station`.
  No change to per-station crawl/sync logic, scheduler templates untouched
  beyond documentation.

## References
- `apps/worker/commands/crawl.ts`
- `apps/worker/commands/sync.ts`
- `apps/worker/lib/cli-args.ts`
- `apps/worker/lib/station-loader.ts`

## Acceptance Criteria
- [ ] `parseStationArgs([], { allowAllStations: true })` returns
      `{ station: undefined }` instead of throwing.
- [ ] `parseStationArgs([])` (no option) still throws `/--station/`.
- [ ] `loadEnabledStationIds(path)` returns the ids of only the enabled stations.
- [ ] `bun run crawl` (no `--station`) crawls every enabled station.
- [ ] `bun run sync` (no `--station`) syncs every enabled station.
- [ ] `bun run crawl --station=zet` and `bun run sync --station=zet` behave as before.
- [ ] `bun test apps/worker` passes.

## Verification (manual)
1. `bun run crawl` → logs a crawl for each enabled station in `config/stations.json`.
2. `bun run crawl --station=zet` → crawls only `zet`.
3. `bun run sync` → syncs each enabled station; one failing station does not stop the rest.
