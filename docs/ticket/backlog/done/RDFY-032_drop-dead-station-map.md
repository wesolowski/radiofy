# RDFY-032 Remove the unused odsluchane station map

## Type
refactor

## Risk
low

## Priority
low

## Status
done

## Owner
implementer

## Background
`ODSLUCHANE_EU_STATIONS` maps four station ids to the aggregator's numeric
`r=` parameter. No production code reads it: the crawler takes
`station.sourceSlug` straight from `config/stations.json` and passes it into
the URL builder. Its only consumer is its own test, and the architecture
document points at it as if it were the lookup table operators should trust.

That is worse than merely dead. RDFY-028 had to re-key it during the station-id
unification purely to stop it contradicting the rest of the project — work
spent maintaining something nothing uses.

## Why not turn it into a validator instead
The obvious alternative is to check an `odsluchane-eu` station's `sourceSlug`
against the map at config load, so a typo like `"sourceSlug": "5"` fails fast
instead of silently crawling a different station into your playlist. That
sounds attractive and is wrong: the map is a subset chosen for the MVP, not a
registry of valid values. Review checked the live site rather than trusting the
architecture document's "50+ more" — which is a claim about the *previous*
source — and found the station selector on odsluchane.eu carries **523**
distinct ids across national, local, TV, internet and retired groups, with
`r=5` (Antyradio) returning a full day of rows. Validating against four entries
would reject 519 working ids and break the documented promise that a new
station needs "nothing but a config entry, no code change".

A real fast-fail for a mistyped slug is a separate problem with its own ticket:
a wrong-but-existing number crawls another station's data into your playlist,
and a non-numeric or unknown one returns the site's landing page with HTTP 200
and no rows, which the crawler records as a healthy run that inserted nothing.

## Scope
- **In scope**: delete `ODSLUCHANE_EU_STATIONS`, its export, and the test that
  covers only it; point the architecture document at `config/stations.json`
  instead.
- **Out of scope (explicit)**: any validation of `sourceSlug`; the
  `odsluchane-eu` parser, URL builder and their tests; `config/stations.json`.

## References
- `packages/sources/src/odsluchane-eu/index.ts`
- `packages/sources/src/index.ts`
- `packages/sources/test/odsluchane-eu/url.test.ts`
- `docs/architecture/PROJECT_ARCHITECTURE.md`

## Acceptance Criteria
- [ ] `ODSLUCHANE_EU_STATIONS` no longer exists in code or in current
      documentation. Closed tickets and result documents keep their mentions —
      they record what was true when they were written.
- [ ] `dayUrls` and `buildUrl` behaviour is unchanged, and their tests still
      cover the three daily windows and the date format.
- [ ] The architecture document names `config/stations.json` as where the
      station-to-slug mapping lives.
- [ ] `bunx tsc --noEmit` and `bun test` pass.

## Verification (manual)
1. `bun run crawl --station=zet --day=2026-09-01` → unchanged behaviour.
2. `git grep ODSLUCHANE_EU_STATIONS` → no matches.
