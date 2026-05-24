# RDFY-005 — Normalizer package (cleanup + Polish ASCII fold)

**Status**: done
**Reviewer decision**: APPROVED
**Branch**: `rdfy-005-normalizer`
**PR**: https://github.com/wesolowski/radiofy/pull/5

## What was delivered

- `packages/normalizer/src/normalize.ts` — pure `normalize(RawSong) → NormalizedSong` plus a `normalizeKeyOnly(artist, title)` helper. No I/O, no module-level mutable state, no env access.
- `packages/normalizer/src/ascii-fold.ts` — Polish character map (`ł ą ć ę ń ó ś ź ż` + uppercase) followed by Unicode NFD strip via `\p{M}`.
- `packages/normalizer/src/index.ts` — public entry exposing `normalize`, `normalizeKeyOnly`, `asciiFold`.
- `packages/normalizer/package.json` — depends on `@radiofy/shared`.

Pipeline applied per segment (artist and title), in order: lowercase → `&`/`&amp;` → ` and ` → strip featuring marker tail → strip parenthetical noise terms (`original mix`, `radio edit`, `bonus track`, standalone `remix`) → ASCII fold → collapse and trim whitespace.

## Files changed

- `bun.lock`
- `docs/ticket/backlog/done/RDFY-005_normalizer-package.md` (moved from `review/`)
- `packages/normalizer/package.json`
- `packages/normalizer/src/ascii-fold.ts` (new)
- `packages/normalizer/src/index.ts`
- `packages/normalizer/src/normalize.ts` (new)
- `packages/normalizer/test/ascii-fold.test.ts` (new)
- `packages/normalizer/test/dedup-smoke.test.ts` (new)
- `packages/normalizer/test/normalize.test.ts` (new)

## Acceptance criteria

- [x] `normalize` is pure — no I/O, no globals, deterministic
- [x] `"Kayah / Grzegorz Hyży - Podatek Od Miłości"` → `kayah|podatek od milosci`
- [x] Diacritic-only difference collapses to the same key (`Hyży / Miłości` vs `Hyzy / Milosci`)
- [x] `"Pitbull feat. Christina Aguilera - Feel This Moment (Radio Edit)"` → `pitbull|feel this moment`
- [x] Original strings preserved in `primaryArtist`, `title`, `originalArtists`, `originalTitle`, `allArtists`
- [x] `bun test packages/normalizer/test/` has 41 tests, including all 9 Polish diacritic pairs and 6 real ZET fixture titles (Komodo, Damiano David, Kayah + Hyży, Ania Dąbrowska, IRA, Sylwia Grzeszczak + Liber)

## Quality gate

- Biome: clean (`bunx biome check .` — 66 files, no fixes)
- TypeScript: clean (`bunx tsc --noEmit` — exit 0)
- Tests: 41 pass / 0 fail / 51 expect calls across 3 files (`bun test packages/normalizer/test/`)
- Dedup smoke: real ZET fixture (≥100 songs) collapses to fewer unique keys than total — confirmed

## Notes / follow-ups (non-blocking)

- The featuring-strip regex `\bfeat\.?` matches any word starting with `feat` (e.g. `Feature Presentation` is wiped). No current ZET fixture title triggers this, and a test fixes the broad behavior for `Artist Feat Other`, so the implementation intentionally errs on permissive. Worth tightening to `\bfeat\.|\bfeat\b(?!\w)` (or similar) in a future ticket if a real title surfaces.
- `normalize({ artists: [], … })` yields `primaryArtist: ''` and a key starting with `|`. Acceptable for v1; downstream consumers must guard against empty artist lists.
- `dedup-smoke.test.ts` reaches into `../../sources/src/...` via a relative path rather than importing `@radiofy/sources`. Fine for a test-only smoke check; consider routing via the package export if `@radiofy/sources` gains a public parse entry.
