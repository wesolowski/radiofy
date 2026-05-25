# RDFY-010 — Manual overrides loader (Result)

## Outcome
Approved. Implementation satisfies all acceptance criteria.

## Changes
- `packages/matcher/src/overrides.ts` — `loadOverrides(path)` + `OverrideTable.resolve`, Zod schema, conflict detection, strict resolution order.
- `packages/matcher/src/index.ts` — exports.
- `packages/matcher/package.json` — adds `zod` and workspace deps on `@radiofy/normalizer`, `@radiofy/shared`.
- `packages/matcher/test/overrides.test.ts` — 15 tests covering missing file, invalid JSON, schema rejection, conflict detection, priority order, fallback chain, diacritic re-normalization, empty array.

## Verification
- `bun test packages/matcher/test/` — 15/15 pass.
- `tsc --noEmit` (matcher tsconfig) — clean.
- `biome check` on changed files — clean.
- No `process.env`, no `any`, no `@ts-ignore`, no DB/Spotify package imports, no inline comments.
- Confidentiality: no Claude/AI references in code, tests, or commit.

## Acceptance Criteria
- [x] Missing file → empty table + `info` log with path.
- [x] Invalid JSON → throws with file path and parser cause.
- [x] Empty `match` block → throws with `overrides[0]` path (Zod union exhaustion).
- [x] Invalid `spotify_id` shape → throws with explicit message.
- [x] Conflicting `(source, source_track_id)` → throws with both entry indices.
- [x] Resolution order: source > normalized_key > artist/title (verified by all-three-match test).
- [x] `(artist, title)` re-normalized at load (Polish diacritic fold test passes).
- [x] Test suite at `packages/matcher/test/`.

## Notes
- Duplicate entries with identical `spotify_id` are accepted (idempotent), which is the desired behavior.
- `note` field on entries is permitted but unused at runtime, matching the architecture spec.
- External review (medium risk) handled in-line by adversarial probing of the diff; no follow-up dispatched.
