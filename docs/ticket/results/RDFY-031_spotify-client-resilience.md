# RDFY-031 — Spotify client: guard response bodies and stop hammering a dead API

## Outcome
Approved. Two gaps RDFY-030 deliberately left open are closed. A Spotify
response whose headers arrive and whose body then stalls is now retried and
finally reported as a transient error naming the URL, instead of escaping as a
bare abort. And a run that cannot reach Spotify stops after a run of
consecutive lookup failures rather than working through every remaining song.

## Why RDFY-030 could not close it
The body could not simply move inside the guarded region, because
`spotifyFetch` returned a `Response` and each of the five call sites decided
for itself what a non-ok status meant: `search` returns an empty list, the
playlist functions throw three different errors, and two of them turn a 404
into `PlaylistNotFoundError`. Reading the body inside the client meant settling
that contract first.

An attempt during RDFY-030 confirmed the risk immediately: a naive helper that
returned the parsed body dropped `if (!res.ok) return []`, so a 404 would have
produced an undefined body and a crash one line later. That is why it was
deferred rather than rushed.

## How it was settled
`spotifyFetchJson` returns a discriminated result — `{ ok: true, status, body }`
or `{ ok: false, status }` — and reads the body inside the retried region. Every
call site keeps exactly the behaviour it had, and the type system now refuses
access to a body that was never read.

## The circuit breaker
`sync` counts consecutive `api_error` outcomes and stops at a threshold,
closing the run with an error and leaving the playlist untouched. Without it,
four attempts plus backoff per doomed lookup turned an unreachable Spotify into
hours of grinding: measured at roughly 43 seconds per uncached song, two
hundred songs is over two hours. `chart` already refused to write on any
`api_error`, so the breaker is a `sync` concern.

## Files changed
- `packages/spotify/src/http.ts` — `withRetries` generalised over what it
  produces; `spotifyFetchJson` added; the status checks moved inside the
  guarded region so the body read shares it.
- `packages/spotify/src/search.ts`, `playlist.ts` — five call sites migrated.
- `apps/worker/lib/sync.ts`, `apps/worker/commands/sync.ts` — the breaker and
  its exit code.
- Tests in `packages/spotify/test/http.test.ts`, `apps/worker/test/sync.test.ts`.

## Two things worth recording
A type-inference cycle appeared during the migration: `url` is reassigned from
`body.next`, `body` comes from the response, and the response call needed
`url` — which the previous fixed return type hid. Explicit annotations on both
break it.

The breaker test uses `Retry-After: 0`, expecting no sleep; the client floors
that at one second, so the test needs its own longer limit. The sleeps are
real, not simulated, which is the same trade the existing retry tests make.

## Verification
- `bunx tsc --noEmit` — exit 0. `bun test` — 328 pass / 1 skip / 0 fail on the
  branch, 327 on `main` after RDFY-032 removed a test with its dead constant.
- New tests cover a stalled body being retried into a transient error, a parsed
  body on success, a non-ok status reported without reading a body, and a
  degraded run that stops without touching the playlist.
