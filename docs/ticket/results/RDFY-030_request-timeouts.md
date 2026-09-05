# RDFY-030 — Time out every outbound request

## Outcome
Approved after two review rounds. Every outbound HTTP call now has a deadline:
the crawl fetch, the chart fetch, the Spotify API client and both Spotify token
exchanges. A server that accepts a connection and never answers can no longer
hold a run open indefinitely, and a timed-out request is treated as the
transient failure it is — retried, and finally reported with the URL that ran
out of time.

## The evidence, and the numbers it produced
The July crawl logs show the aggregator taking a full minute before answering
`504`, three times in a row (`16:26:07 → 16:27:07`, `16:30:18 → 16:31:19`,
`16:31:37 → 16:32:37`), against a host that answers healthy requests in about
0.4 seconds. With the retry from RDFY-025 that is roughly three minutes per lost
day.

Deadlines chosen from that: **20s for the scraped sources** — fifty times a
healthy response, comfortably below the 60s gateway, so a hung day costs at most
~61s instead of ~181s — and **10s for Spotify**, lower because `sync` issues one
request per uncached song and four attempts each adds up quickly.

## Why this covered Spotify at all
The evidence came from the crawl, but `sync` and `chart` replace a playlist by
clearing it and refilling it. A request that hangs between those two steps
leaves the playlist empty for as long as the process is stuck. Fixing only the
crawl would have left the more damaging instance of the same bug in place.

## Files changed
- `apps/worker/lib/crawl.ts` — deadline in `fetchWithRetry`, body read moved
  inside the guarded region, `timeoutMs` option.
- `apps/worker/lib/chart.ts` — same shape.
- `packages/spotify/src/http.ts` — deadline, and a timeout is now caught,
  backed off, retried and finally thrown as `SpotifyTransientError`.
- `packages/spotify/src/auth.ts`, `auth-flow.ts` — deadline naming the token
  endpoint.
- Tests in `apps/worker/test/{crawl,chart}.test.ts`,
  `packages/spotify/test/http.test.ts`.

## Review findings addressed
- **`spotifyFetch` never caught its own timeout.** It has no try/catch, so a
  timeout propagated raw, bypassing both the retry loop and the
  `SpotifyTransientError` classification. That broke a chain built in RDFY-027:
  the matcher converts a transient error into an `api_error` outcome, and the
  chart refuses to rewrite a playlist when any lookup ended that way. A bare
  abort walked past that guard. Found while briefing the review, not by it.
- **A stalled body escaped the mapping.** The deadline governs the body too,
  but the body was read outside the guarded region, so a source that sent
  headers and then went quiet produced a bare "The operation timed out." — no
  URL, no retry. Crawl and chart now read the body where timeouts are mapped.
- **The crawl test never exercised the mapping.** Its hanging stub rejected
  with a plain `Error`, whose name is never `TimeoutError`, so the branch the
  test existed to cover never ran — it would have passed with the mapping
  deleted. The stub now rejects the way `fetch` does, and the test asserts the
  recorded `crawl_runs.error` names the URL.
- The unreachable `AbortError` arm was removed, and the token exchanges now
  name their endpoint.

The reviewer confirmed by mutation that the tests fail when each fix is
reverted: neutering `isTimeout` fails both URL assertions, moving the body read
back outside the guard drops the retry count from 3 to 1, and reverting the
Spotify catch yields a raw `DOMException` instead of `SpotifyTransientError`.

## Deliberately left open
Spotify response bodies are still read by the callers rather than inside the
guarded region. The hang is fixed, and the playlist stays untouched either way,
but the abort surfaces without the URL and without the transient
classification. Closing it means settling how five call sites treat a non-ok
response — one returns an empty list, three throw different errors — which is a
change to the client's error contract rather than a deadline. An attempt at it
during this ticket immediately produced a defect (a 404 would have yielded an
undefined body), which confirmed the scope judgement. It moved to RDFY-031,
together with stopping a run that meets a dead Spotify instead of working
through every remaining song.

## Verification
- `bunx tsc --noEmit` — exit 0. `bun test` — 307 pass / 1 skip / 0 fail.
- The new tests add roughly 7s to the suite, nearly all of it real backoff
  sleeps, consistent with the retry tests already in the project.
