# RDFY-035 A crawl that finds nothing reports itself as healthy

## Type
bug

## Risk
medium

## Priority
high

## Status
review

## Background
A station whose `sourceSlug` is wrong does not fail. `odsluchane.eu` answers an
unknown or non-numeric `r=` value with its landing page and HTTP 200, which
contains no song rows. The parser returns an empty list, `crawlOneDay` closes
the run with no error and `songsSeen = 0`, and `bun run status` reports the
station as healthy. The playlist then empties out as the last real plays age
past the seven-day window — with nothing anywhere saying why.

A wrong-but-valid number is worse still: `r=5` is Antyradio, so a single
mistyped digit quietly fills the ESKA playlist with another station's music,
and every part of the system considers that a success.

This was found while reviewing RDFY-032, by probing the live site rather than
trusting the documentation: the station selector carries 523 ids, so there is
no small list to validate against — but there is a cheap, provably correct
check, because every one of those ids is an integer.

## Symptom
Set a station's `sourceSlug` to `radio-zet` or `999999` and run
`bun run crawl --station=<id>`. It exits 0, logs `songsSeen: 0`, closes the
audit row without an error, and `bun run status` shows the station as `ok`.

## Scope
- **In scope**:
  - Reject a non-numeric `odsluchane-eu` station id where the URL is built,
    the way a malformed date is already rejected there.
  - Make a day that parses zero songs visible: it is a legitimate outcome for a
    station that was off air, but it should not be indistinguishable from a
    healthy crawl in `status`.
  - Record in `crawl_runs.songs_seen` what the column says: the number of songs
    the source offered. It currently stores the number of rows that were new,
    so an idempotent re-crawl of days already collected writes zero — which
    would have made the new health state fire on every healthy repeat run. No
    consumer read the column before this ticket, so correcting it breaks
    nothing.
- **Out of scope (explicit)**:
  - Cross-checking a station id against the source's own station list, which is
    a network call at config load and a separate decision.
  - Any change to the parser or to the retry and timeout behaviour.

## References
- `packages/sources/src/odsluchane-eu/url.ts`
- `apps/worker/lib/crawl.ts`
- `apps/worker/lib/status.ts`

## Acceptance Criteria
- [ ] `buildUrl` throws for a non-numeric station id, with a message naming the
      offending value.
- [ ] A day that parses zero songs is distinguishable in `bun run status` from
      a day that collected plays.
- [ ] Re-crawling days already collected records the songs the source offered,
      not zero, so a healthy repeat run is not flagged.
- [ ] A station that is genuinely silent for a day still completes without an
      error.
- [ ] `bun test` passes.

## Verification (manual)
1. Set `sourceSlug` to `radio-zet` → the crawl fails immediately and names the
   value, instead of exiting 0.
2. Set it to a valid number for a different station → out of scope for this
   ticket; note that this still succeeds silently.
