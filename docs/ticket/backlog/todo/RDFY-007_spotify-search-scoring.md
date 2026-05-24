# [RDFY-007] Spotify search + match scoring

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
The matcher needs a primitive that takes a normalized song and returns ranked Spotify candidates with confidence scores. Thresholds defined in the architecture decide auto-match vs. low-confidence vs. not-found.

## Scope
- **In scope**:
  - `packages/spotify/search.ts`: `searchTrack(normalizedSong) → ScoredCandidate[]`
  - Query construction: ASCII-folded form first, diacritic fallback on empty results
  - Jaro–Winkler implementation for title and artist similarity
  - Score formula from architecture: `0.5 * title + 0.4 * artistOverlap + 0.1 * durationProximity`
  - Honor Spotify `Retry-After` on 429, exponential backoff (max 3 retries) on 5xx
- **Out of scope (explicit)**: cache writes, database access, unmatched-table writes, playlist mutations. The function is pure with respect to local state — only its side effect is the HTTP call.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Matcher Thresholds"
- `RDFY-005`, `RDFY-006`

## Acceptance Criteria
- [ ] `searchTrack` returns candidates sorted by score descending
- [ ] A clear top match for a popular English title produces a score >= 0.85 in a recorded HTTP fixture test
- [ ] No-result Spotify response returns `[]`, not an error
- [ ] `429` with `Retry-After: 2` triggers a 2s sleep and a single retry
- [ ] `500` triggers backoff retry up to 3 times, then throws a typed `SpotifyTransientError`
- [ ] Title similarity below 0.5 is dropped regardless of artist overlap
- [ ] Jaro–Winkler implementation is property-tested: `jw(a,a)=1`, `jw(a,b)=jw(b,a)`, `0<=jw<=1`
- [ ] `bun test packages/spotify/test/search/` passes with HTTP-fake fixtures

## Verification (manual)
1. Replay a recorded 200-response fixture for `Komodo - (I Just) Died In Your Arms` → top candidate has the expected Spotify ID, score >= 0.85
2. Replay a 429-then-200 fixture → exactly one retry, total elapsed at least `Retry-After` seconds
3. Hand-craft a low-confidence pair (typo'd title) → score lands in `[0.6, 0.85)`
