# Eska Gorąca 20 — chart snapshot path

Design for bringing the Eska Gorąca 20 chart into Radiofy as a first-class
path, replacing an external single-purpose tool. Approved 2026-09-04.

## Why

The chart is currently synced by a separate program outside this repository.
That split forces the operator to maintain unmatched-song corrections twice,
and the external tool cannot hold corrections at all: it replaces the whole
playlist on every run, so any manual fix is destroyed on the next execution.

Bringing the chart in means one matcher, one `storage/overrides.json`, one
maintenance surface. Because override resolution has source-independent levels
(`normalized_key` and `(artist, title)`), a song corrected for a radio station
is corrected for the chart too, and vice versa.

## What the source page contains

Verified against one snapshot of `https://www.eska.pl/goraca20/`:

| | |
|---|---|
| Chart | exactly 20 `div.single-hit` blocks, each with `.single-hit__position` 1–20 and an up/down marker |
| Proposals | 25 `div.single-hit` blocks under an `<h2>PROPOZYCJE</h2>` heading, **without** a position element |
| Markup | both sections use the identical `div.single-hit` structure |
| Artists | a `<li>` list of `a.single-hit__author`; 5 of the 20 chart entries have more than one |
| Track id | in the entry href, shape `so-XXXX-XXXX-XXXX`; all 45 blocks carry one, all 45 distinct |

Two defects in the external tool follow from this and are fixed by
construction here: it selects `div.single-hit` document-wide, so it puts all 45
entries into the playlist instead of the chart's 20; and it reads only the
first `a.single-hit__author`, discarding co-artists on every fourth chart
entry and searching Spotify for the wrong thing.

## Playlist shape

One playlist, ordered: chart rank 1–20 first, then the 25 proposals in page
order. Order is **given by the page** and must not be re-sorted — this is the
structural reason the chart cannot flow through `runSync`, which sorts by play
count then recency (`apps/worker/lib/sync.ts:130-134`).

- An entry that does not resolve on Spotify is skipped; the gap closes and
  relative order is preserved.
- If the same track id appears in both sections, the first (chart) occurrence
  wins and it is not repeated.

## Boundary: never a station

The chart must **not** become an entry in `config/stations.json`. Both
all-stations loops iterate `loadEnabledStationIds()`
(`apps/worker/commands/crawl.ts:19`, `commands/sync.ts:9`,
`apps/worker/lib/weekly.ts:32`), so an entry there is reachable by a plain
`bun run sync`, not only by `weekly`. Separation by config file — a distinct
`config/charts.json` with its own loader — is what guarantees no station loop
can reach the chart playlist. This constraint originates in RDFY-026.

## No chart history

Each run fetches, resolves and replaces. Persisted state is only what Radiofy
needs anyway: `songs`, `spotify_matches` (the search cache) and
`unmatched_songs` (the override backlog). No `plays` rows — a chart has
rankings, not play timestamps — and no new table. History can be added later
without reworking this path.

## Components

### Parser — `packages/sources/src/eska-goraca20/`

Exports `parseChart({ html }): ChartEntry[]`.

```ts
interface ChartEntry {
  sourceTrackId: string;
  rank: number;                        // 1..N, final playlist position
  section: 'chart' | 'proposal';
  position: number | null;             // chart rank 1-20, null for proposals
  artists: string[];
  title: string;
  displayText: string;
}
```

Section assignment is **structural, not textual**: a `div.single-hit`
containing a numeric `.single-hit__position` is a chart entry, one without is a
proposal. This survives any rewording of the `PROPOZYCJE` heading. Output is
chart entries ordered by position ascending, then proposals in document order,
with `rank` running across both.

The track id is extracted as `so-XXXX-XXXX-XXXX` from the entry href. The `so-`
prefix is **observed in one snapshot, not proven invariant**. An entry whose id
does not match is skipped with a debug log — the same behaviour
`malopolskie-media` uses for links without a numeric id. The parser never
invents a substitute id, because a synthetic id would silently break overrides
keyed on `(source, source_track_id)`.

### Configuration — `config/charts.json`

Committed as `[]`, mirroring `config/stations.json` since RDFY-001, so forkers
supply their own values. A zod schema and `loadCharts()` live beside the
station equivalents in `packages/shared/src/config.ts`.

```json
[{
  "id": "eska-goraca20",
  "name": "Eska Gorąca 20",
  "source": "eska-goraca20",
  "url": "https://www.eska.pl/goraca20/",
  "playlistName": "<your-playlist-name>",
  "minEntries": 20,
  "enabled": true
}]
```

The URL is configuration rather than code: Eska publishes further charts with
identical markup, so pointing the same parser at another one costs nothing.

### Pipeline — `apps/worker/lib/chart.ts`, `apps/worker/commands/chart.ts`

`runChart(options): Promise<ChartOutcome>`, driven by `bun run chart` with no
flags. A `--chart=<id>` selector can follow later exactly as `--station` did in
RDFY-023.

1. Load the chart config; report `not_found` / `disabled` early.
2. Overlap guard over `playlist_sync_runs` with the same cutoff `runSync` uses
   → `blocked`.
3. Open a run row.
4. Fetch the URL.
5. Parse into final order.
6. Per entry: normalize, then `resolveSong`; collect resolved Spotify ids
   **in order**, first occurrence wins on duplicates.
7. Resolve the playlist by name, else `playlist_not_found`.
8. Clear, then append in chunks of 100 **in order**.
9. Close the run with `tracksWritten`.

`playlist_sync_runs.station` is free text, so the chart id goes there and the
audit row plus concurrency guard come without a migration. `bun run status`
builds its rows from `loadStations()` (`apps/worker/lib/status.ts:65`), so a
chart run does not appear there; surfacing it is deliberately a separate
ticket.

`resolveSong` reads only `rawSong.sourceTrackId`
(`packages/matcher/src/resolve.ts:49,111`), so the chart reuses the matcher
unchanged and sets `RawSong.playedAt` to the fetch timestamp — honest as "seen
at", and unread by the matcher. Narrowing `ResolveContext.rawSong` to
`{ sourceTrackId }` would be cleaner and is noted as a follow-up; it is not
done here to keep this change's blast radius off `packages/matcher`.

## Error handling

Clear-and-fill makes a broken parse dangerous: if the page markup changes and
the parser finds three entries instead of 45, a naive run would replace the
playlist with three tracks. Hence a plausibility floor.

The playlist is left **untouched** when:

- the fetch fails (non-2xx or thrown), or
- the parser yields fewer than `minEntries` entries, or
- no entry resolves to a Spotify track (`no_songs`, mirroring
  `apps/worker/lib/sync.ts:136`).

Only a plausible, resolved run writes. Each of the three closes the run row
with its error and exits non-zero.

The floor defaults to **20**, not to the 45 a full page yields. Verified
against the live page after implementation: the ranked chart is reliably 20
entries, while the proposal count varies (25 in the captured snapshot, 23 the
same day live). A floor above 20 would therefore reject a perfectly healthy
page whose proposal section shrank or disappeared, and the playlist would
silently stop updating. 20 still catches a redesign, which yields close to
zero.

Retry is deliberately omitted for now: one request per run, and a failed run
costs a skipped update rather than lost data — unlike a multi-day crawl, where
RDFY-025 had to add retries. Reusing `fetchWithRetry` would mean extracting it
from `apps/worker/lib/crawl.ts`, which is in flight in PR #27.

Known residual exposure, stated rather than hidden: if Spotify fails *between*
the clear and the append, the playlist is left partially filled. This is the
identical exposure the existing `sync` carries; no new mechanism is invented
for it here.

Exit codes follow the project convention: `0` clean, `1` failure, `2` blocked.

## Testing

**Parser** — `packages/sources/test/eska-goraca20/`, fixture
`fixtures/goraca20.html` (the captured page with ad iframes and scripts
stripped; 45 blocks, 20 positioned, 45 distinct ids retained):

- 20 chart entries, positions 1–20, in ascending order.
- 25 proposals, ranked after every chart entry.
- The four-artist entry ("Dna (More Than a Game)") yields all four artists.
- All 45 ids extracted and pairwise distinct.
- An entry whose href lacks the id pattern is skipped.
- A page with no `single-hit` blocks yields `[]`.

**Worker** — `apps/worker/test/chart.test.ts`, in-memory DB and stubbed fetch,
following the existing `sync.test.ts` pattern:

- Happy path asserts the **order of the uris array in the POST body** against
  the chart order — the property the whole ticket exists for.
- An unresolvable entry is skipped and relative order holds.
- Below `minEntries`: no playlist call.
- Nothing resolves: `no_songs`, no playlist call.
- A run already in flight: `blocked`.
- A disabled chart is skipped.

## Out of scope

- Chart history or rank-movement analytics.
- `bun run status` showing the chart.
- Scheduler installation and failure notification.
- Retry on the chart fetch.
- Any change to `crawl`, `sync`, `weekly`, or `config/stations.json`.
