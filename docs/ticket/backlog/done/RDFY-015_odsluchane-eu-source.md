# [RDFY-015] Switch to odsluchane.eu — primary source (CF-blocked malopolskie-media replacement)

## Type
bug

## Risk
medium

## Priority
high

## Status
review

## Owner
implementer

## Background
`malopolskie-media.info` (the source RDFY-004 was built around) is behind Cloudflare's "Under Attack Mode" / Bot Fight challenge. Plain `fetch` returns 403 with `cf-mitigated: challenge`; browser-mimicking headers don't help; headless Chromium plus the `puppeteer-extra-plugin-stealth` plugin still doesn't pass the Polish "Cierpliwości…" challenge in 45 s. The site is effectively unreachable for an unattended worker.

`odsluchane.eu` is a sibling Polish playlist aggregator that covers the same MVP stations (ZET, RMF FM, ESKA, RMF MAXX, plus 20+ more). It is also on Cloudflare but without the challenge — plain `fetch` returns 200 with the full HTML.

## Symptom
- `bun run crawl --station=radio-zet --day=2026-05-25` exits 1 with `HTTP 403 from https://malopolskie-media.info/...`.

## Scope
- **In scope**:
  - New source `packages/sources/src/odsluchane-eu/` with `buildUrl`, `dayUrls`, `parse`, station id map for the four MVP stations
  - Add `dayUrls(slug, day): string[]` to the source interface so a source can declare how many sub-fetches are needed for one day; `malopolskie-media` returns the single URL it always did
  - Three 10-hour windows per day for `odsluchane-eu` (the site rejects wider windows, and `time_to=24` returns truncated data; `time_to=0` is the working "end of day" marker for the last slot)
  - Update `apps/worker/lib/crawl.ts` to iterate `source.dayUrls(...)` and concatenate the parsed songs from every window
  - Fixture: real ZET 00:00-10:00 window from 2026-05-25
  - Tests for both `buildUrl` (date format conversion, hour range) and `parse` (real fixture)
- **Out of scope (explicit)**: removing `malopolskie-media` code (kept as a deprecated source so the multi-source abstraction is still demonstrated); switching `config/stations.json` defaults (operators do that per their own setup); Playwright dependency (briefly tried during diagnosis, reverted because odsluchane.eu does not need it).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Data Sources"
- `RDFY-004` (original malopolskie-media parser)
- Live data confirmation: `https://www.odsluchane.eu/szukaj.php?r=1&date=25-05-2026&time_from=0&time_to=10`

## Acceptance Criteria
- [ ] `packages/sources/src/odsluchane-eu/` exists with `buildUrl`, `dayUrls`, `parse`, `index.ts`
- [ ] `buildUrl('1', '2026-05-25', 0, 10)` returns `https://www.odsluchane.eu/szukaj.php?r=1&date=25-05-2026&time_from=0&time_to=10`
- [ ] `dayUrls('1', '2026-05-25')` returns three URLs covering the full day (0-10 / 10-20 / 20-0)
- [ ] Parsing the live ZET 0-10 fixture yields >= 30 songs with numeric `sourceTrackId`s
- [ ] `ODSLUCHANE_EU_STATIONS` maps the four MVP slugs to `'1'`, `'2'`, `'3'`, `'4'`
- [ ] `malopolskieMediaSource` also exposes `dayUrls` (the interface change is uniform)
- [ ] `apps/worker/lib/crawl.ts` fetches every URL in `source.dayUrls(...)` and concatenates; existing `malopolskie-media` test still passes (single window)
- [ ] No `any`, no `@ts-ignore`, no `process.env` outside `packages/shared/src/config.ts`
- [ ] `bun test`, `bunx tsc --noEmit`, `bunx biome check .` clean

## Verification (manual)
1. Switch a station entry in `config/stations.json` to `"source": "odsluchane-eu", "sourceSlug": "1"`.
2. `bun run crawl --station=radio-zet --day=2026-05-25` exits 0, logs three fetches, ~230 unique songs persisted (overlap from the boundary hours is silently de-duplicated by the UNIQUE constraint).
3. `bun run sync --station=radio-zet` updates the Spotify playlist.
