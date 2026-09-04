# RDFY-027 Eska Gorąca 20 chart snapshot path

## Type
feature

## Risk
medium

## Priority
high

## Status
done

## Owner
implementer

## Background
The Eska Gorąca 20 chart is currently synced by a separate program outside
this repository. That split forces the operator to maintain corrections for
unmatched songs in two places, and the external program cannot hold
corrections at all: it replaces the entire playlist on every run, so any
manual fix is destroyed the next time it executes.

Bringing the chart into Radiofy means one matcher and one corrections file for
everything. Because corrections resolve on source-independent keys, a song
fixed for a radio station is fixed for the chart as well.

## Scope
- **In scope**:
  - A parser for the Gorąca 20 page that separates the ranked chart from the
    unranked proposals below it and collects every credited artist.
  - A `chart` command that fetches the page, resolves each entry against
    Spotify (override → cache → live search) and replaces one playlist with
    the resolved tracks in page order: chart rank 1–20 first, then the
    proposals in page order.
  - A `config/charts.json` configuration file with its own loader, committed
    empty so forkers supply their own values.
  - A plausibility floor: a run that parses fewer than the configured minimum
    of entries leaves the playlist untouched and fails. The floor defaults to
    20 — the ranked chart is reliably 20 entries while the proposal count
    varies, so a higher floor would reject a healthy page.
- **Out of scope (explicit)**:
  - Chart history or rank-movement analytics; no new database table.
  - `bun run status` showing the chart.
  - Scheduler installation and failure notification.
  - Retry on the chart fetch.
  - Any change to `crawl`, `sync`, `weekly` or `config/stations.json`.

## Constraint — the chart is never a station
The chart must not become an entry in `config/stations.json`. Both
all-stations loops iterate `loadEnabledStationIds()`, so an entry there is
reachable by a plain `bun run sync`, not only by `weekly`. Separation by
config file is what guarantees no station loop can reach the chart playlist.
Inherited from RDFY-026.

## References
- `docs/superpowers/specs/2026-09-04-eska-goraca20-chart-design.md`
- `packages/sources/src/malopolskie-media/parse.ts` (parser pattern)
- `apps/worker/lib/sync.ts` (playlist replace, overlap guard, `no_songs` guard)
- `packages/matcher/src/resolve.ts` (`resolveSong`)
- `packages/shared/src/config.ts` (station schema and loader)

## Acceptance Criteria
- [ ] `parseChart` on the captured fixture returns 45 entries: 20 with
      `section: 'chart'` and `position` 1–20 in ascending order, then 25 with
      `section: 'proposal'` and `position: null`, with `rank` running 1–45.
- [ ] The entry "Dna (More Than a Game)" yields all four credited artists.
- [ ] All 45 entries carry a distinct `sourceTrackId`; an entry whose href
      lacks the id pattern is skipped rather than given a substitute id.
- [ ] `parseChart` on markup without `div.single-hit` returns `[]`.
- [ ] `runChart` writes the resolved tracks to the playlist in chart order —
      verified against the order of the `uris` array sent to Spotify.
- [ ] An entry that does not resolve is skipped and the relative order of the
      remaining tracks is unchanged.
- [ ] A parse yielding fewer than `minEntries` entries attempts no playlist
      call and reports a failure.
- [ ] A run where nothing resolves returns `no_songs` and attempts no playlist
      call.
- [ ] A chart with a run already in flight returns `blocked`; a disabled chart
      is skipped.
- [ ] `bun run chart` exits `0` clean, `1` on failure, `2` when blocked.
- [ ] `bun test` passes.

## Verification (manual)
1. Create a Spotify playlist, put its name in `config/charts.json` →
   `bun run chart` fills it with the chart in rank order.
2. Rename the playlist in Spotify → `bun run chart` reports the playlist as
   not found, exits non-zero, changes nothing.
3. Point `url` at a page without chart markup → the run fails on the
   plausibility floor and the playlist keeps its previous contents.
