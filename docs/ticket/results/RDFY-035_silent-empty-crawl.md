# RDFY-035 — A crawl that finds nothing reported itself as healthy

## Outcome
Done. A station configured with a station id the source cannot use now fails
immediately instead of collecting nothing and calling it a success, and a crawl
that genuinely found no songs is visible in `bun run status` rather than
indistinguishable from a healthy one.

## The failure this closes
`odsluchane.eu` answers an unknown or slug-style `r=` value with its ordinary
landing page and HTTP 200. The parser finds no rows, `crawlOneDay` closes the
run with no error, and `status` reports the station as `ok`. The playlist then
drains as the last real plays age out of the seven-day window, with nothing
anywhere explaining why.

Every station id in the site's own selector is an integer — 523 of them,
established by review probing the live site — so a `/^\d+$/` guard in the URL
builder is both cheap and provably correct. It sits beside the malformed-date
throw that was already there.

## What the work turned up
Adding the health state exposed a second defect. The audit column is named
`songs_seen` but stored the number of rows that were *new*, so re-crawling days
already collected recorded zero. The new state fired on all four healthy
stations the first time it ran — a false alarm that proved the signal was
measuring the wrong thing.

Nothing read the column before this ticket, so it now records what its name
says. `inserted` remains in the run log, where it was already reported.

## Files changed
- `packages/sources/src/odsluchane-eu/url.ts` — the guard.
- `apps/worker/lib/crawl.ts` — the audit column records songs offered.
- `apps/worker/lib/status.ts` — `empty` health state, counted as a problem.
- Tests in `packages/sources/test/odsluchane-eu/url.test.ts`,
  `apps/worker/test/{crawl,status}.test.ts`.

## Not covered
A wrong-but-existing number still succeeds silently: `r=5` is Antyradio, so one
mistyped digit fills the ESKA playlist with another station's music and every
part of the system considers it a success. Catching that needs the source's own
station list cross-checked against the station name, which is a network call at
config load and a separate decision.

## Verification
- `bunx tsc --noEmit` — exit 0. `bun test` — 332 pass / 1 skip / 0 fail.
- On the real installation: `status` showed all four stations `empty` before the
  fix — correctly, since their audit rows held re-crawl counts of zero — then
  `ok` after one 17-second crawl, with `songs_seen` holding 397 to 406 per day
  instead of 0.
