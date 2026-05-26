# RDFY-020 — prune-plays command — Result

## Outcome
Approved. All acceptance criteria met. PR #22.

## What was done
- `packages/database/src/repos/plays.ts`: added `countOlderThan(db, cutoffIso)` and `deleteOlderThan(db, cutoffIso)` (delete via before/after diff to report deleted-row count).
- `apps/worker/lib/prune-plays.ts`: `runPrunePlays(options)` mirrors `runPruneAudit` shape. Default `--keep-days=30`; refuses non-integer or `< 1` with a thrown error.
- `apps/worker/commands/prune-plays.ts`: thin CLI wrapper; parses `--keep-days` / `--dry-run`, exits 1 on invalid input or thrown error.
- `package.json`: `"prune-plays": "bun apps/worker/commands/prune-plays.ts"` script added.
- `docs/operations/cron/crontab.example`: monthly `prune-plays` line next to `prune-audit`.
- `README.md` + `docs/operations/runbook.md`: documented under the housekeeping section / CLI table.
- `apps/worker/test/prune-plays.test.ts`: 5 tests — dry-run does not delete, default deletes correctly, keep-days=200 keeps all, keep-days=0 rejected, non-integer rejected.

## Verification
- `bun test apps/worker/test/prune-plays.test.ts` — 5/5 pass.
- `bun test apps/worker/test/` — 64/64 pass.
- `bun test packages/database` — 13/13 pass.
- `bunx tsc --noEmit` — clean.
- `bunx biome check` on the four changed code files — clean.
- Cutoff math verified: `keep-days=30` with NOW=`2026-05-26T12:00:00Z` produces cutoff `2026-04-26T12:00:00Z`, `played_at < cutoff` deletes exactly the two old fixture rows.
- No `process.env` access in new files; no inline comments; no Claude/AI references; no `any` / `@ts-ignore`.

## Files changed
- `packages/database/src/repos/plays.ts`
- `apps/worker/lib/prune-plays.ts` (new)
- `apps/worker/commands/prune-plays.ts` (new)
- `apps/worker/test/prune-plays.test.ts` (new)
- `package.json`
- `docs/operations/cron/crontab.example`
- `docs/operations/runbook.md`
- `README.md`
