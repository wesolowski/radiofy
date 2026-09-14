# RDFY-037 Configure the Eska Gorąca 20 chart

## Type
feature

## Risk
low

## Priority
high

## Status
review

## Owner
implementer

## Background
RDFY-027 built the chart path but shipped `config/charts.json` empty, so
`bun run chart` has nothing to do. The operator's playlist already exists in
Spotify and has been maintained by the external tool this path replaces; that
tool last ran on 2026-07-18 and the playlist has been stale since.

Filling the configuration is the last step that makes the chart path actually
run, and it retires the external program.

## Scope
- **In scope**: one chart entry in `config/charts.json`, pointing at the
  existing playlist.
- **Out of scope (explicit)**: the parser, the pipeline and the command, all
  delivered by RDFY-027; `config/stations.json`; the scheduler.

## Constraint
The chart stays out of `config/stations.json`, so no all-stations command can
reach its playlist. Inherited from RDFY-026 and RDFY-027.

## Why the playlist name is safe to commit
Same reasoning as RDFY-028: `.claude/CLAUDE.md` lists Spotify playlist names as
identifiers, not secrets. The worker resolves the name through the operator's
own OAuth token, so a name in the repository grants nobody access to anything.

## References
- `config/charts.json`
- `apps/worker/lib/chart.ts`
- `docs/superpowers/specs/2026-09-04-eska-goraca20-chart-design.md`

## Acceptance Criteria
- [ ] `config/charts.json` holds one enabled entry with the chart's id, the
      source id `eska-goraca20`, the page URL, the existing playlist name and a
      plausibility floor of 20.
- [ ] `bun run chart` fills that playlist with the chart in rank order,
      followed by the proposals, and exits 0.
- [ ] The entry validates against the existing schema.
- [ ] `bun test` passes.

## Verification (manual)
1. `bun run chart` → exits 0 and reports the tracks written.
2. `bun run export-playlist --name="<the playlist>"` → the first rows are the
   chart's top entries in order.
