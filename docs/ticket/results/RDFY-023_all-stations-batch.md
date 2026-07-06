# RDFY-023 Result — Crawl and sync all stations when --station is omitted

## Status
Done — approved by reviewer.

## What was done
`--station` is now optional for `bun run crawl` and `bun run sync`. When omitted,
both commands iterate over every enabled station from `config/stations.json`;
`--station=<id>` preserves single-station behavior. Batch runs continue past a
failing station and exit non-zero (`1`) if any station failed, or `2` if any
station was blocked by an in-progress run. All other commands still require
`--station` (they do not use `parseStationArgs` and were not modified).

`parseStationArgs` gained an `allowAllStations` option, implemented via typed
overloads: the default overload returns `StationArgs` (station required), and the
`{ allowAllStations: true }` overload returns `OptionalStationArgs` (station may
be undefined). A new `loadEnabledStationIds` helper returns the ids of enabled
stations only.

## Files changed
- `apps/worker/lib/cli-args.ts` — `allowAllStations` option via overloads; new `OptionalStationArgs` / `ParseOptions` types
- `apps/worker/lib/station-loader.ts` — new `loadEnabledStationIds`
- `apps/worker/commands/crawl.ts` — batch loop over enabled stations, deferred exit codes
- `apps/worker/commands/sync.ts` — batch loop over enabled stations, deferred exit codes
- `apps/worker/test/cli-args.test.ts` — tests for `allowAllStations` behavior
- `apps/worker/test/station-loader.test.ts` — tests for `loadEnabledStationIds`
- `README.md` — updated usage docs for optional `--station`

## Verification
- Acceptance criteria: all met.
  - `parseStationArgs([], { allowAllStations: true })` returns `{}` (functionally equivalent to `{ station: undefined }`); `args.station !== undefined` correctly triggers the all-stations path.
  - `parseStationArgs([])` still throws `/--station/`.
  - `loadEnabledStationIds` returns only enabled station ids (covered by tests).
  - crawl/sync iterate every enabled station when `--station` omitted; single-station path preserved.
- `bunx tsc --noEmit` — clean.
- `bun test apps/worker` — 68 pass, 0 fail.
- `bunx biome check` per changed file — no fixes needed.
- Out-of-scope commands (`export-unmatched`, `status`, `prune-audit`, `prune-plays`, `top-played`, `overrides-validate`, `export-playlist`) unchanged; none use `parseStationArgs`.
- Public-repo hygiene: no secrets or personal data. The uncommitted `config/stations.json` change is intentionally not part of this commit.
- Risk `low` → external review not required.

## Notes
Batch runs preserve per-station idempotency (per-station crawl/sync logic
unchanged). Failure isolation is handled by a per-iteration try/catch with
deferred exit codes, so one failing station does not abort the rest.
