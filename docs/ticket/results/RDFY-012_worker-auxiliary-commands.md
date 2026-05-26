# RDFY-012 — Worker auxiliary CLI commands

## Status
APPROVED — moved review → done.

## Scope delivered
Five read-only operator commands wired through `apps/worker/commands/*` to pure runners in `apps/worker/lib/*`:

- `export-unmatched [--station] [--since] [--all]` — RFC 4180 CSV, default skips resolved, sort `occurrence_count DESC, last_seen_at DESC`.
- `export-playlist --name=<name>` — Spotify-only reads, documented columns, missing playlist exits 1, empty playlist emits header and exits 0.
- `status [--strict]` — per-station table, 36h stale threshold, 5-min stuck threshold across both `*_runs` tables, cache size, open unmatched. `no_data` only flips exit code under `--strict`.
- `overrides:validate` — tri-state (missing / ok / error) with matching exit codes.
- `prune-audit [--keep-days=90] [--dry-run]` — deletes only rows with `finished_at IS NOT NULL`; dry-run uses count queries.

New repo helpers: `crawl-runs`/`sync-runs` (`findStuckOlderThan`, `lastSuccess`, `count/deleteClosedOlderThan`), `matches.count`, `unmatched.list`/`countOpen`. Shared `csv.ts` helper.

## Files
- `apps/worker/lib/{csv,export-unmatched,export-playlist,status,overrides-validate,prune-audit}.ts`
- `apps/worker/commands/{export-unmatched,export-playlist,status,overrides-validate,prune-audit}.ts`
- `packages/database/src/repos/{crawl-runs,sync-runs,matches,unmatched}.ts`
- `apps/worker/test/{csv,export-unmatched,status,overrides-validate,prune-audit}.test.ts`

## Verification
- `bun test apps/worker/test/` — 48 pass, 0 fail
- `bunx tsc --noEmit` — clean
- `bunx biome check .` — clean

## Acceptance criteria
All 11 ACs satisfied. No mutations to `plays` / `songs` / `spotify_matches` / `unmatched_songs` from any of these commands (verified by source grep). No `any`, `@ts-ignore`, inline comments, or direct `process.env` access outside `packages/shared/src/config.ts`.
