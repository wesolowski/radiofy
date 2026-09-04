# RDFY-030 Time out every outbound request

## Type
bug

## Risk
low

## Priority
medium

## Status
review

## Owner
implementer

## Background
No outbound HTTP request in the project has a deadline. A server that accepts a
connection and then never answers holds a run open indefinitely: the scheduled
job never finishes, the next one is refused by the overlap guard, and the
dead-man switch reports a run that started and never ended.

This is not hypothetical. The 2026-07-06 crawl logs show the aggregator taking
a full minute before answering `504`, three times in a row: `16:26:07 → 16:27:07`,
`16:30:18 → 16:31:19`, `16:31:37 → 16:32:37`. A successful request to the same
host takes about 0.4 seconds. With the retry added in RDFY-025, a day that
fails this way now costs roughly three minutes of wall clock instead of one,
and a full range across four stations could spend well over an hour waiting for
answers that never come.

## Symptom
A crawl of one day against an unresponsive source occupies the process for
60 seconds per attempt with no output, and a hung connection occupies it
forever. Nothing distinguishes "slow" from "never" in the logs or in
`crawl_runs`.

## Scope
- **In scope**:
  - A request deadline on every outbound HTTP call: the crawl fetch, the chart
    fetch, the Spotify API client, and both Spotify token exchanges.
  - The deadline is configurable where a caller already passes options, so an
    operator on a slow link can raise it.
  - A timed-out request reports which URL ran out of time, so the reason lands
    in `crawl_runs.error` instead of a bare abort message.
  - Existing retry behaviour is preserved: a timeout is a transient failure and
    is retried like any other thrown network error.
- **Out of scope (explicit)**:
  - Changing retry counts, backoff shape, or which status codes are retried.
  - A global configuration surface or CLI flag for the deadline.
  - Connection-level tuning such as keep-alive or DNS timeouts.

## Why this covers Spotify too, not only the crawl
The evidence came from the crawl, but the defect is the same everywhere and the
consequence is worse on the Spotify side: `sync` and `chart` replace a playlist
by clearing it and refilling it. A request that hangs between those two steps
leaves the playlist empty for as long as the process is stuck. Fixing only the
crawl would leave the more damaging instance of the same bug in place.

## References
- `apps/worker/lib/crawl.ts` (`fetchWithRetry`)
- `apps/worker/lib/chart.ts`
- `packages/spotify/src/http.ts`
- `packages/spotify/src/auth.ts`, `packages/spotify/src/auth-flow.ts`

## Acceptance Criteria
- [ ] A crawl fetch that never answers is aborted after the deadline, retried,
      and the day fails with an error naming the URL that timed out.
- [ ] A chart fetch that never answers is aborted after the deadline and the
      playlist is left untouched.
- [ ] A Spotify request that never answers is aborted after the deadline.
- [ ] The deadline is overridable through the existing options objects, and the
      tests use a short one so the suite stays fast.
- [ ] A request that answers within the deadline behaves exactly as before.
- [ ] `bun test` passes.

## Verification (manual)
1. Point a station's source at a host that accepts connections and never
   answers → the day fails within a few times the deadline rather than hanging,
   and `bun run status` shows no stuck run.
2. `bun run crawl` against the healthy source → unchanged timings.
