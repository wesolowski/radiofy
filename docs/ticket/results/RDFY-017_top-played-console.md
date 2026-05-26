# [RDFY-017] top-played console command — Result

## Status
done

## Outcome
APPROVED. All acceptance criteria met, quality gate clean.

## Changes
- `apps/worker/lib/top-played.ts` (new) — `runTopPlayed(options)` reads `playsRepo.findResolutionInputsInWindow` per enabled station, slices to `limit`, prints fixed-width plain-text blocks. Color gated on `options.color ?? process.stdout.isTTY`.
- `apps/worker/commands/top-played.ts` (new) — CLI wrapper using `node:util#parseArgs`. Validates `--limit` as positive integer.
- `apps/worker/test/top-played.test.ts` (new) — 6 tests: ranking + limit, default 7-day window, `--since` override, station filter + disabled skip, no-ANSI when `color=false`, empty-window line.
- `package.json` — adds `"top-played": "bun apps/worker/commands/top-played.ts"`.

## Verification
- `bunx biome check` on the three new files: clean.
- `bunx tsc --noEmit`: clean.
- `bun test apps/worker/test/top-played.test.ts`: 6/6 pass, 11 expects.
- Read-only verified by inspection: only `findResolutionInputsInWindow` and `loadStations` invoked; no writes to `plays`, `songs`, `spotify_matches`, `unmatched_songs`, audit tables.
- No `process.env` outside `packages/shared/src/config.ts`. No `any`, no `@ts-ignore`, no inline comments. Confidentiality clean.

## Notes
Scope mentioned an optional dim-grey Spotify track id beside each row; this is not in the formal AC checklist and was not implemented. Repository helper returns `sourceTrackId` (crawler-side id), not a resolved Spotify track id — adding that would require a join against `spotify_matches`. Out of scope for this ticket; can be tracked separately if desired.

## Files
- `apps/worker/lib/top-played.ts`
- `apps/worker/commands/top-played.ts`
- `apps/worker/test/top-played.test.ts`
- `package.json`
