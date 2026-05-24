# [RDFY-004] Source parser — malopolskie-media.info — Result

## Summary
Implemented the `malopolskie-media` source parser. `buildUrl` produces the canonical full-day URL; `parse` extracts `RawSong` rows from the aggregator's static HTML using cheerio, defensively skipping malformed anchors, bad time cells, and missing delimiters. Times are converted from the page's `Europe/Warsaw` day to UTC ISO-8601 via the shared `toUtc` helper. The source is registered through `malopolskieMediaSource` and re-exported from the package root.

## Files changed
- `packages/sources/package.json` — added `cheerio ^1.0.0` and `@radiofy/shared` workspace dependencies
- `packages/sources/src/index.ts` — exposes `MALOPOLSKIE_MEDIA_ID`, `malopolskieMediaSource`, and `ParseInput`
- `packages/sources/src/malopolskie-media/url.ts` — `buildUrl(slug, day, hourFrom=0, hourTo=24)`
- `packages/sources/src/malopolskie-media/parse.ts` — cheerio extraction, ID/time/display defensive parsing, UTC conversion
- `packages/sources/src/malopolskie-media/index.ts` — source registration surface
- `packages/sources/test/malopolskie-media/url.test.ts` — URL builder cases
- `packages/sources/test/malopolskie-media/parse.test.ts` — live fixture, empty fixture, malformed fixture
- `packages/sources/test/malopolskie-media/fixtures/radio-zet-2026-05-24.html` — real-world ZET page (228 anchors)
- `packages/sources/test/malopolskie-media/fixtures/empty.html` — no-songs negative fixture
- `packages/sources/test/malopolskie-media/fixtures/malformed.html` — bad-id / bad-time / no-delimiter mixed rows
- `bun.lock` — cheerio and transitive deps locked

## Acceptance criteria
- [x] `buildUrl('radio-zet', '2026-05-24')` returns `https://malopolskie-media.info/playlista/radio-zet/2026-05-24/0/24.html`
- [x] ZET fixture yields well above the 100-song threshold (228 anchors in the page)
- [x] Every `RawSong.sourceTrackId` is non-empty and matches `^\d+$`
- [x] `Kayah / Grzegorz Hyży - Podatek Od Miłości` → `artists=['Kayah','Grzegorz Hyży']`, `title='Podatek Od Miłości'`
- [x] `playedAt` is UTC ISO-8601 with `Z` suffix; first ZET song at local 00:08 → `2026-05-23T22:08:00.000Z` (DST UTC+2)
- [x] Empty playlist fixture returns `[]` without throwing
- [x] Malformed fixture: 3 bad rows skipped, 2 good rows returned
- [x] `bun test packages/sources/test/` passes (11 pass / 0 fail)

## Quality gate
- `bunx biome check packages/sources/` — clean (8 files)
- `bunx tsc --noEmit` — clean (no output)
- `bun test` — 48 pass / 1 skip / 0 fail (full project)
- No `any`, no `@ts-ignore`, no `process.env` / `Bun.env`, no `console.*`, no inline comments
- Package boundary respected: `RawSong`, `logger`, `toUtc` imported from `@radiofy/shared`

## Notes
- `station` is consumed only by `logger.debug` calls inside parse; `RawSong` intentionally has no `station` field, the worker adds it later per architecture
- `$link.find('i').remove()` mutates the loaded DOM but is scoped per-row, so it does not pollute later iterations
- `extractTrackId` requires the trailing `-` after the numeric id (matches every real anchor on the aggregator); a hypothetical `/utwor/<id>.html` without a slug would be skipped — acceptable for the current source contract
