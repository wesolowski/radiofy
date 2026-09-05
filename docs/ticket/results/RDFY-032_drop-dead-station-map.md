# RDFY-032 — Remove the unused odsluchane station map

## Outcome
Approved after one round. `ODSLUCHANE_EU_STATIONS` is gone from the code and
from current documentation. Nothing read it — the crawler takes `sourceSlug`
straight from the station configuration — yet RDFY-028 had to re-key it during
the station-id unification purely to stop it contradicting everything else.

## The decision that mattered
The tempting alternative was to keep it as a validator, so a mistyped
`sourceSlug` would fail fast instead of silently crawling another station into
the wrong playlist. That was rejected, and review confirmed the reasoning while
correcting its evidence: the "50+ more" figure in the architecture document
describes the *previous* source. Checking the live site instead found the
station selector on odsluchane.eu carries **523** ids, with `r=5` (Antyradio)
returning a full day of rows. Validating against four entries would have
rejected 519 working values and broken the documented promise that a new
station needs "nothing but a config entry, no code change".

## What review surfaced instead
The concern behind that alternative is real, and worse than the ticket assumed:
an unknown or non-numeric `r=` value returns the site's landing page with HTTP
200 and no rows, so the crawler records a healthy run that inserted nothing and
`bun run status` shows the station as `ok`. The playlist then empties as the
last real plays age out of the window. There is a cheap, provably correct guard
— every id on the site is an integer — and it went to RDFY-035 rather than into
this ticket.

## Files changed
- `packages/sources/src/odsluchane-eu/index.ts`, `packages/sources/src/index.ts`
- `packages/sources/test/odsluchane-eu/url.test.ts` — only the block covering
  the map; the window and date-format coverage is untouched.
- `docs/architecture/PROJECT_ARCHITECTURE.md` — points at
  `config/stations.json` and states that no list of valid ids exists in code.

## Review findings addressed
- The doc comment for the removed constant was left behind, describing a symbol
  that no longer exists and pointing at a table the same change removed.
- The acceptance criterion claimed the name would be gone from the whole
  repository. Closed tickets and result documents keep it, correctly; the
  criterion now says "code and current documentation".

## Verification
- `bunx tsc --noEmit` — exit 0. `bun test` — 322 pass / 1 skip / 0 fail.
- `dayUrls` and `buildUrl` unchanged, confirmed by the surviving URL tests.
