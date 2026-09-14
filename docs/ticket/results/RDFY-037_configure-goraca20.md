# RDFY-037 — Configure the Eska Gorąca 20 chart

## Outcome
Done. `config/charts.json` carries one entry pointing at the operator's
existing "Eska Gorąca" playlist, which puts the chart path built in RDFY-027
into service and retires the external program.

That program last ran on 2026-07-18; the playlist had been stale since, holding
53 tracks from July.

## Files changed
- `config/charts.json` — one enabled entry: the chart id, source
  `eska-goraca20`, the page URL, the existing playlist name, and a plausibility
  floor of 20.

## Verification
- The existing playlist was exported before anything was written, as a record
  of the 53 tracks it held.
- `bun run chart` — 48 entries parsed, 48 tracks written, exit 0, 4.4 seconds.
  Every entry resolved, because the match cache is shared with the station
  playlists.
- The written order was compared against the live page position by position:

  | # | Page | Playlist |
  |---|---|---|
  | 1 | Rmb (Ring My Bell) (Mata Remix) — Aitch, Mata | RMB (Ring My Bell) - Polish Remix — Aitch |
  | 2 | Tylko Kochaj Mnie — Zalia | tylko kochaj mnie — Zalia |
  | 3 | Sunflower — Post Malone, Swae Lee | Sunflower - Spider-Man: Into the Spider-Verse — Post Malone |
  | 4 | My Body Isn't Ready — Sombr | My Body Isn't Ready — sombr |
  | 5 | Później Ci Opowiem — Dawid Kwiatkowski, Margaret | Później Ci opowiem — Dawid Kwiatkowski |

  The titles differ where Spotify's catalogue names a release differently; the
  order does not.
- `bunx tsc --noEmit` — exit 0. `bun test` — 332 pass / 1 skip / 0 fail.

## What this retires
The external program put all of the page's entries into the playlist rather
than the ranked twenty followed by the suggestions, and kept only the first
credited artist of each entry — searching for the wrong thing on roughly every
fourth chart entry. Both are fixed by construction here.

## Still open
Nothing schedules the chart. `docs/operations/cron/crontab.example` carries the
daily line; it needs a host to run on.
