# RDFY-031 Spotify client: guard response bodies and stop hammering a dead API

## Type
bug

## Risk
medium

## Priority
medium

## Status
review

## Background
RDFY-030 gave every outbound request a deadline, but two gaps in the Spotify
client were left open deliberately, both surfaced by review.

**The response body is read outside the guarded region.** `spotifyFetch`
returns a `Response` and each caller then awaits `res.json()`. A response whose
headers arrive and whose body then stalls does hit the deadline — the run ends
rather than hanging — but the abort escapes as a bare "The operation timed
out.": no URL, no retry, and not a `SpotifyTransientError`. That last part
matters beyond diagnostics: the matcher only converts a transient error into an
`api_error` outcome, and the chart's plausibility guard only refuses to rewrite
a playlist when it sees `api_error`. A raw abort bypasses that guard.

The fix was left out of RDFY-030 on purpose. Each of the five call sites treats
a non-ok response differently — `search` returns an empty list, the playlist
functions throw three different errors — so a body-reading helper has to settle
the client's error contract first. That is a refactor, not a timeout.

**A dead Spotify API is bounded but still ruinous.** `sync` resolves one
request per uncached song and continues past `api_error`. With four attempts at
ten seconds plus backoff, each unresolvable song costs about 43 seconds: fifty
uncached songs is half an hour, two hundred is well over two. Bounded is better
than the previous infinite hang, but a run that cannot reach Spotify should
stop, not grind.

## Scope
- **In scope**:
  - Read Spotify response bodies inside the retried, guarded region, so a
    stalled body is retried and reported as transient with its URL.
  - Settle the non-ok contract across the five call sites as part of that.
  - Stop a run after a number of consecutive transient Spotify failures rather
    than attempting every remaining song.
- **Out of scope (explicit)**:
  - Changing deadlines, retry counts or backoff shape.
  - The crawl and chart bodies, already covered by RDFY-030.

## References
- `packages/spotify/src/http.ts`
- `packages/spotify/src/search.ts`, `packages/spotify/src/playlist.ts`
- `packages/matcher/src/resolve.ts` (transient → `api_error`)
- `apps/worker/lib/sync.ts`, `apps/worker/lib/chart.ts`

## Acceptance Criteria
- [ ] A Spotify response whose body stalls is retried and finally reported as a
      transient error naming the URL.
- [ ] That error reaches the matcher as `api_error`, so the chart's guard sees
      it and leaves the playlist untouched.
- [ ] Each call site's existing behaviour for a non-ok response is preserved or
      deliberately changed, with the change stated.
- [ ] A run that meets a configurable number of consecutive transient Spotify
      failures stops and reports, instead of attempting every remaining song.
- [ ] `bun test` passes.

## Verification (manual)
1. Point the Spotify host at a server that sends headers and then stalls → the
   run ends within a few deadlines, names the URL, and the playlist is
   unchanged.
2. Point it at a server that never answers → `sync` stops after the configured
   number of failures rather than working through the whole backlog.
