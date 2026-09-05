# RDFY-032 Remove the unused odsluchane station map

## Type
refactor

## Risk
low

## Priority
low

## Status
review

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
sounds attractive and is wrong: the aggregator covers the four MVP stations
"and 50+ more", so the map is a subset chosen for the MVP, not a registry of
valid values. Validating against it would reject slugs that work perfectly
well, turning a helpful check into a blocker the moment someone adds a fifth
station — exactly the case the architecture says needs "nothing but a config
entry, no code change".

A real fast-fail for a mistyped slug would need the aggregator's own station
list, which is out of scope here.

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
- [ ] `ODSLUCHANE_EU_STATIONS` no longer exists anywhere in the repository.
- [ ] `dayUrls` and `buildUrl` behaviour is unchanged, and their tests still
      cover the three daily windows and the date format.
- [ ] The architecture document names `config/stations.json` as where the
      station-to-slug mapping lives.
- [ ] `bunx tsc --noEmit` and `bun test` pass.

## Verification (manual)
1. `bun run crawl --station=zet --day=2026-09-01` → unchanged behaviour.
2. `git grep ODSLUCHANE_EU_STATIONS` → no matches.
