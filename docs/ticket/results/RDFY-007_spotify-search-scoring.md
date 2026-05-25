# RDFY-007 — Spotify search + match scoring

## Outcome
APPROVED. All eight acceptance criteria are satisfied. Implementation matches the architecture's "Matcher Thresholds" section and stays within the declared scope.

## What was implemented
- `packages/spotify/src/search.ts` — `searchTrack(song, accessToken, options)` returns `ScoredCandidate[]`. ASCII-folded query is tried first; a diacritic-preserving fallback runs only when the folded form differs from the original AND the first attempt returned `[]`. No-result responses return `[]`.
- `packages/spotify/src/score.ts` — `scoreCandidates` applies `0.5*title + 0.4*artist + 0.1*duration` when duration is available; renormalizes to `/(0.5+0.4)` when duration is missing. Title similarity below 0.5 drops the candidate. Sorted desc by score.
- `packages/spotify/src/jaro-winkler.ts` — Jaro–Winkler with prefix scale 0.1 and prefix max 4. Reflexive on non-empty input, symmetric, bounded `[0,1]`. Hand-derived `jw('MARTHA','MARHTA') ≈ 0.9555` matches the test expectation.
- `packages/spotify/src/http.ts` — `spotifyFetch` honours `Retry-After` on 429 (single retry within MAX_RETRIES), exponential backoff (`2^attempt * 500ms`) on 5xx up to 3 retries, then `SpotifyTransientError`. 401 throws `SpotifyAuthExpiredError` immediately; refresh-and-retry responsibility sits with the caller (matcher package).
- `packages/spotify/src/index.ts` — barrel exports for the new symbols.

## Files changed
- `bun.lock` (workspace edge)
- `packages/spotify/package.json` (added `@radiofy/normalizer` workspace dep)
- `packages/spotify/src/{http,index,jaro-winkler,score,search}.ts`
- `packages/spotify/test/{http,jaro-winkler,score,search}.test.ts`

## Quality gate
- `bun test packages/spotify/test/` → 59 pass / 0 fail / 400 expectations
- `bunx biome check packages/spotify/{src,test}` → clean (20 files, 0 fixes)
- `bunx tsc --noEmit -p packages/spotify/tsconfig.json` → clean
- `.claude/hooks/confidentiality-check.sh` → exit 0
- No inline comments in new source files
- No `process.env` / `Bun.env` access in `packages/spotify/src/`
- No `any` / `@ts-ignore` in new files

## Verification of acceptance criteria
1. Sorted desc — checked by `score.test.ts › candidates are returned in descending score order`.
2. Top match ≥ 0.85 — `score.test.ts › a clear top match…` and `search.test.ts › happy path`.
3. No-result → `[]` — `search.test.ts › returns [] when Spotify returns no tracks`.
4. 429 + `Retry-After: 2` → 2s sleep + retry — `http.test.ts › Retry-After of 2 sleeps for at least ~2000ms` (elapsed ≥ 1800 ms).
5. 500 backoff up to 3 retries → `SpotifyTransientError` — `http.test.ts › 5xx triggers exponential backoff…`.
6. Title similarity < 0.5 dropped — `score.test.ts › candidates with title similarity below 0.5 are dropped`.
7. JW property tests (reflexive, symmetric, bounded) — `jaro-winkler.test.ts`.
8. `bun test packages/spotify/test/` passes.

## Follow-up note (advisory, not blocking)
- `401` refresh-and-retry policy from the architecture ("on 401 refresh once and retry") is intentionally not handled inside `spotifyFetch`; it will be the matcher/orchestrator layer's responsibility (token cache lives there). Worth tracking in the matcher ticket.

## Risk
medium — no external review required.
