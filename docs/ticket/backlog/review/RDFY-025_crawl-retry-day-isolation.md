# RDFY-025 Crawl resilience: retry transient errors and isolate per-day failures

## Type
bug

## Risk
low

## Priority
high

## Symptom
During a multi-day crawl, a single transient upstream response aborted the
whole station. Observed in a real run: `zet` got `HTTP 504` on the first day of
its 7-day range and none of the remaining six days were crawled; `eska` got
`HTTP 500` on day four and lost the rest of its range. The source
(odsluchane.eu) returns 500/504 intermittently.

Reproduction: run `bun run crawl` while the source returns a 5xx for one day —
that day's failure ends the station's remaining days.

## Background
The weekly playlists depend on a complete crawl window. A transient gateway
error on one day should not discard the days that would otherwise succeed, and
short-lived 5xx / network blips should be retried rather than surfaced as a hard
failure on the first attempt.

## Scope
- **In scope**:
  - Retry transient fetch failures (HTTP 5xx and thrown network errors) with
    exponential backoff before giving up on a day, mirroring the existing
    Spotify HTTP client.
  - Isolate per-day failures inside a station crawl: a day that still fails
    after retries is logged and recorded in `crawl_runs`, but the remaining
    days of that station are still crawled.
  - Surface whether any day failed so the command exits non-zero.
- **Out of scope (explicit)**: 4xx responses (not retried — not transient),
  changes to `sync`, changes to the source parsers or URL construction, request
  timeouts.

## References
- `apps/worker/lib/crawl.ts`
- `apps/worker/commands/crawl.ts`
- `README.md`
- `packages/spotify/src/http.ts` (retry pattern reference)

## Acceptance Criteria
- [ ] A URL returning 5xx twice then 200 is retried and the day succeeds.
- [ ] A URL returning 5xx on every attempt fails that day only; other days in
      the range still crawl (`daysFailed` reflects the failed day, `daysCrawled`
      still equals the range size).
- [ ] A `fetch` that throws once then resolves is retried and the day succeeds.
- [ ] A 4xx response is not retried.
- [ ] `runCrawl` reports `daysFailed > 0` when any day fails; `bun run crawl`
      exits non-zero in that case.
- [ ] `bun test apps/worker` passes.

## Verification (manual)
1. `bun run crawl` while one day 5xx-es → that day logs an error, the other days
   of the station still crawl, the process exits non-zero.
