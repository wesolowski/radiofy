# RDFY-027 — Eska Gorąca 20 chart snapshot path

## Outcome
Approved, with one substantive finding fixed before merge. The Gorąca 20 chart
is now produced by Radiofy: `bun run chart` fetches the page, resolves each
entry through the shared matcher (override → cache → live search) and replaces
one playlist with the resolved tracks in the page's own order — chart rank 1–20
first, then the unranked proposals.

This retires the external single-purpose tool and, with it, the double
maintenance of unmatched-song corrections. Corrections now resolve for the
chart and the station playlists alike, and they survive every run instead of
being discarded by the next one.

## Files changed
- `packages/sources/src/eska-goraca20/{parse.ts,index.ts}` — new parser and
  module.
- `packages/sources/test/eska-goraca20/{parse.test.ts,fixtures/goraca20.html}`
  — new; captured page with scripts, ad iframes and an ad-request identifier
  stripped.
- `packages/sources/src/index.ts` — public exports.
- `packages/shared/src/{types.ts,config.ts,index.ts}` — `Chart` type, zod
  schema, `loadCharts()`.
- `apps/worker/lib/chart.ts`, `apps/worker/commands/chart.ts` — pipeline and
  entry point.
- `apps/worker/test/chart.test.ts` — 12 tests.
- `config/charts.json` — committed as `[]`, like `config/stations.json`.
- `package.json`, `README.md` — script and documentation.
- `docs/superpowers/specs/2026-09-04-eska-goraca20-chart-design.md` — design.

## Two defects in the external tool fixed by construction
- It selected `div.single-hit` document-wide, so the 25 voting proposals landed
  in the playlist as if they were chart entries. Sections are now told apart
  structurally: an entry with a numeric `.single-hit__position` is chart, one
  without is a proposal. The proposals still reach the playlist, but
  deliberately and after position 20.
- It read only the first `a.single-hit__author`, discarding co-artists on 5 of
  the 20 chart entries and searching Spotify for the wrong thing. Every
  credited artist is now used — "Dna (More Than a Game)" goes out with all four.

## Acceptance criteria
All met. 10 of 11 are covered by tests; `bun run chart`'s exit codes are
verified by inspection, consistent with the repo having no tests for any
`commands/*` entry point.

## Review findings addressed
- **Degraded Spotify lookups could still truncate the playlist** (medium). The
  entry floor guarded against a page redesign, but `api_error` was treated like
  `no_results`: with the search endpoint failing and the playlist endpoints
  healthy, a plausible parse could have replaced the playlist with however few
  entries resolved — the same truncation, one layer down. A run where any
  lookup fails outright now leaves the playlist untouched and reports
  `degraded`. Covered by a test that fails one title's search past its retries.
- **Untouched-playlist runs recorded as successes.** `no_songs` closed its audit
  row with no error, so `lastSuccess` advanced while the command exited
  non-zero. Both `no_songs` and `degraded` now close with a reason.
- **The entry floor's default lived only in prose.** The schema required
  `minEntries` and accepted `1`, which silently disables the ticket's central
  safety property. It now defaults to 20 in the validator.
- **Ordering was asserted on four sampled indices.** The happy path now
  compares the full 45-element `uris` array against the parsed order, so any
  permutation fails. Added a floor-boundary test (exactly at, and one short of,
  `minEntries`) and a cross-section deduplication test.
- **Spec overstated the page structure.** It implied the page holds 45
  `div.single-hit` blocks; it holds 67, the extra 22 being promotional tiles
  without an entry href. Corrected, with a note that the parser skips anything
  lacking a usable track id.
- **Fixture carried an ad-request identifier** (`data-google-query-id`) with no
  test value. Removed.
- **Dead export.** `eskaGoraca20Source` was exported but unused; the parser
  registry now goes through it, matching how `crawl.ts` registers its sources.

Accepted as-is, with reasons recorded: `blocked` outranks `failed` in the exit
code when several charts are configured, which mirrors `commands/sync.ts` and is
moot with one chart; `fetch` has no timeout, matching `crawl.ts`; and
`RawSong.playedAt` carries the fetch timestamp because the matcher reads only
`sourceTrackId` — narrowing that type is noted in the spec as a follow-up.

## Verified against the live page, not only the fixture
A full run against `https://www.eska.pl/goraca20/` with a deliberately
non-existent playlist name exercised fetch, parse and Spotify resolution end to
end while writing nothing: 43 entries parsed, then `playlist_not_found`.

That run corrected the design: the floor had been specified as 25. Live, the
ranked chart is reliably 20 while the proposal count varies — 25 in the
snapshot, 23 the same day live. A floor above 20 would eventually reject a
healthy page and freeze the playlist silently, so the default is 20, which
still catches a redesign (which yields close to zero).

An independent structural check of the live page confirmed the parser's
assumption holds beyond the snapshot: 20 positioned entries, 23 unpositioned,
43 distinct `so-` ids.

## Verification
- `bunx biome check --write` per changed file — clean.
- `bunx tsc --noEmit` — exit 0, no diagnostics.
- `bun test` — 292 pass / 1 skip / 0 fail, 1411 expect() calls across 40 files.
- Pre-commit hygiene, fixture included: no scripts, iframes, session or
  tracking identifiers, no personal data; only public CDN hosts and public
  catalogue identifiers.

## Operator step before first use
`config/charts.json` ships empty by design. Create a playlist in Spotify, put
its name in that file together with the chart's id and url, then run
`bun run chart`.
