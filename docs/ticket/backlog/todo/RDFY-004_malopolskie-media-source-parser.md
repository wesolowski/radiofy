# [RDFY-004] Source parser — malopolskie-media.info

## Type
feature

## Risk
medium

## Priority
high

## Status
todo

## Owner
implementer

## Background
The MVP relies on a single aggregator that exposes all four target stations. A correct, well-tested parser unblocks the entire crawl pipeline. A real-world HTML sample for Radio ZET 2026-05-24 already exists at `docs/html/test.html` and serves as the primary fixture.

## Scope
- **In scope**:
  - `packages/sources/malopolskie-media/url.ts` — `buildUrl(slug, day, hourFrom=0, hourTo=24)`
  - `packages/sources/malopolskie-media/parse.ts` — cheerio extraction returning `RawSong[]` with `{ sourceTrackId, displayText, artists, title, playedAt }`
  - `packages/sources/malopolskie-media/index.ts` — public surface, registers the source under id `malopolskie-media`
  - HTML fixtures: copy `docs/html/test.html` into `packages/sources/malopolskie-media/test/fixtures/radio-zet-2026-05-24.html`. Add at least one negative fixture (page with no songs).
  - Defensive parsing: malformed `<a>` tags, missing time cells, empty playlist tables — log + skip, do not crash
- **Out of scope (explicit)**: normalization (RDFY-005), database writes, Spotify lookups, scheduling.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Data Sources", "Parsing Strategy"
- `docs/html/test.html` (live sample)
- `RDFY-001`, `RDFY-002`

## Acceptance Criteria
- [ ] `buildUrl('radio-zet', '2026-05-24')` returns `https://malopolskie-media.info/playlista/radio-zet/2026-05-24/0/24.html`
- [ ] Parsing the ZET fixture returns >= 100 songs (a full day of broadcast)
- [ ] Each returned `RawSong` has a non-empty `sourceTrackId` extracted from the `/utwor/<id>-` URL prefix
- [ ] Multi-artist line `Kayah / Grzegorz Hyży - Podatek Od Miłości` parses to `artists=['Kayah','Grzegorz Hyży']`, `title='Podatek Od Miłości'`
- [ ] `playedAt` is a valid UTC ISO-8601 derived from the `HH:MM` cell + page day in `Europe/Warsaw`
- [ ] Empty playlist page returns `[]`, no throw
- [ ] `bun test packages/sources/malopolskie-media/test/` passes

## Verification (manual)
1. Run the parser against `docs/html/test.html` via a small REPL script → first song is `Komodo - (I Just) Died In Your Arms` with `sourceTrackId='86665'`
2. Run against a hand-crafted empty fixture → returns `[]`
3. Run against a fixture with a malformed row → that row is skipped, others are returned
