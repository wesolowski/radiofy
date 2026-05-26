# RDFY-015 — odsluchane.eu primary source

## Result
APPROVED — moved review → done.

## Summary
`malopolskie-media.info` is unreachable behind Cloudflare "Under Attack Mode". A
new `odsluchane-eu` source was added that fetches the same four MVP stations
(ZET, RMF FM, ESKA, RMF MAXX) over plain HTTP with no challenge. The source
interface gained a uniform `dayUrls(slug, day): string[]` so a source can declare
how many sub-fetches are needed for one day; `malopolskie-media` still returns a
single URL, `odsluchane-eu` returns three 10-hour windows. The crawl loop
iterates `source.dayUrls(...)` and concatenates parsed songs across windows.

## Files changed
- `packages/sources/src/odsluchane-eu/url.ts` — `buildUrl`, YYYY-MM-DD → DD-MM-YYYY conversion
- `packages/sources/src/odsluchane-eu/parse.ts` — table parser, ` - ` artist/title split, ` / ` multi-artist
- `packages/sources/src/odsluchane-eu/index.ts` — station id map, three-window `dayUrls`
- `packages/sources/src/index.ts` — re-export
- `packages/sources/src/malopolskie-media/index.ts` — adds `dayUrls` for interface symmetry
- `apps/worker/lib/crawl.ts` — iterates `source.dayUrls`, concatenates songs
- `packages/sources/test/odsluchane-eu/url.test.ts` — `buildUrl` + `dayUrls` + station-map tests
- `packages/sources/test/odsluchane-eu/parse.test.ts` — live ZET fixture, ≥30 songs, numeric ids, UTC playedAt
- `packages/sources/test/odsluchane-eu/fixtures/radio-zet-2026-05-25-window-0-5.html` — live fixture

## Quality gate
- `bunx tsc --noEmit` — clean
- `bunx biome check .` — 116 files, no fixes needed
- `bun test` — 245 pass, 1 skip, 0 fail (1286 expectations, 36 files)

## Adversarial findings
- `dayUrls` is symmetric across both sources, callable with identical syntax from `crawl.ts` — no `?.` fallback needed.
- Boundary-hour overlap (10:00, 20:00) in the three-window scheme is real; `playsRepo.insert` swallows the resulting UNIQUE-constraint violation silently (`crawl.ts:119`), so the crawl does not crash.
- Tests load fixtures from disk via `readFileSync`; no live network calls.
- Date conversion preserves zero-padded input verbatim; callers always pass `YYYY-MM-DD` from `yesterdayInTz`, so the un-padded edge case is not reachable.

## Minor (non-blocking)
- `fixtures/radio-zet-2026-05-25.html` is included in the diff but not referenced by any test — could be removed in a follow-up.
- Architecture doc `docs/architecture/PROJECT_ARCHITECTURE.md` still describes only `malopolskie-media` under "Data Sources" — a documentation pass on the new source can follow separately; not required by the ticket's acceptance criteria.

## Confidentiality
No mention of Claude / AI / LLM in code, commit messages, or PR text.
