# [RDFY-005] Normalizer package — cleanup + Polish ASCII fold

## Type
feature

## Risk
medium

## Priority
high

## Status
todo

## Owner
implementer

## Background
Normalization is the foundation of deduplication and the matcher cache. Its `normalizedKey` must be deterministic and stable across stations and over time. Polish diacritics demand special handling because the aggregator returns them verbatim and Spotify search behaves inconsistently with them.

## Scope
- **In scope**:
  - `normalize(rawSong) → NormalizedSong { normalizedKey, primaryArtist, allArtists, title, originalArtists, originalTitle }`
  - All seven cleanup steps from the architecture, in order
  - Polish ASCII fold map plus Unicode NFD strip
  - `&` / `&amp;` → `and`
  - Strip parenthetical noise from a configurable list (initial: `original mix`, `radio edit`, `bonus track`, `remix` only when standalone)
- **Out of scope (explicit)**: matcher score calculation, Spotify search, database. No reading from `config/`.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Normalization Rules"
- `RDFY-001`, `RDFY-002`

## Acceptance Criteria
- [ ] `normalize` is pure (no I/O, no globals)
- [ ] `"Kayah / Grzegorz Hyży - Podatek Od Miłości"` → `normalizedKey = "kayah|podatek od milosci"`
- [ ] Two inputs differing only in diacritics produce the same `normalizedKey`
- [ ] `"Pitbull feat. Christina Aguilera - Feel This Moment (Radio Edit)"` → `normalizedKey = "pitbull|feel this moment"`
- [ ] Original strings (with diacritics, case, feat.) are preserved in `originalArtists` / `originalTitle`
- [ ] `bun test packages/normalizer/test/` has at least 20 cases, including all listed Polish diacritics and at least 5 real titles from the ZET fixture

## Verification (manual)
1. Pipe 50 random songs from the ZET fixture through the normalizer → `normalizedKey` count strictly less than input count (deduplication is happening)
2. Hand-craft three pairs (ASCII vs. diacritic, with vs. without `feat.`, with vs. without `(Radio Edit)`) → each pair collapses to the same key
