# RDFY-033 Configuration examples still show the blocked source

## Type
bug

## Risk
low

## Priority
medium

## Status
done

## Owner
implementer

## Background
The station configuration examples in the operator runbook and the architecture
document declare `"source": "malopolskie-media"` with slug-style values such as
`"radio-zet"`. That source has been unreachable since 2026-05, when the site
moved behind a Cloudflare challenge the worker cannot pass; `odsluchane-eu`
replaced it in RDFY-015 and is what the committed `config/stations.json`
actually uses, with numeric slugs.

An operator following the runbook therefore hand-builds a configuration that
parses, validates and crawls nothing — and the failure arrives as a network
error against a site the documentation never mentions as retired.

## Symptom
Copying the runbook's first-time-setup example produces a station whose crawl
fails against `malopolskie-media.info`, while the file shipped in the
repository names a different source entirely.

## Scope
- **In scope**: bring the two configuration examples in line with the committed
  configuration — active source, numeric slugs — and say where those numbers
  come from.
- **Out of scope (explicit)**:
  - The `malopolskie-media` parser, its fixtures and its tests. It remains in
    the codebase as a working implementation for a source that may return.
  - The architecture document's "malopolskie-media.info (deprecated)" section,
    which is correct as a record of the retired source.
  - `config/stations.json` itself, which is already correct.

## References
- `docs/operations/runbook.md` (first-time setup)
- `docs/architecture/PROJECT_ARCHITECTURE.md` (configuration example)
- `config/stations.json`

## Acceptance Criteria
- [ ] Both configuration examples use `"source": "odsluchane-eu"` with the
      numeric `sourceSlug` values matching `config/stations.json`.
- [ ] Each example says the number is the aggregator's `r=` parameter, so a
      reader knows where a fifth station's value would come from.
- [ ] The deprecated-source section and the parser are untouched.
- [ ] An example copied into `config/stations.json` validates and crawls.

## Verification (manual)
1. Copy the runbook example verbatim into `config/stations.json` →
   `bun run status` lists the station and `bun run crawl --station=zet` reaches
   the active source.
