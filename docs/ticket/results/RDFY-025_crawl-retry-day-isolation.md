# RDFY-025 — Crawl resilience: retry transient errors and isolate per-day failures

## Outcome
Approved after one round of review changes. Transient upstream failures — HTTP
5xx responses and thrown network errors — are now retried with exponential
backoff before a day is given up on, mirroring the backoff shape already used
by the Spotify HTTP client. A day that still fails after retries is logged and
closed in `crawl_runs` with its error, while the station's remaining days are
still crawled; the command exits non-zero when any day failed.

This closes a failure observed in a real run: on 2026-07-06 all four stations
aborted on the first 5xx they met (`zet` and `rmfmaxx` on the very first day of
their seven-day range), which left the play log two months stale and the
playlists unchanged since early June.

## Files changed
- `apps/worker/lib/crawl.ts` — `fetchWithRetry` wrapper; per-day try/catch so a
  failing day closes its own audit row and the loop continues; `daysFailed`
  added to the `ok` outcome.
- `apps/worker/commands/crawl.ts` — a run reporting `daysFailed > 0` now marks
  the invocation as failed.
- `apps/worker/test/crawl.test.ts` — retry and isolation coverage.
- `README.md` — retry and per-day isolation behaviour documented.

## Acceptance criteria
- A URL returning 5xx twice, then 200, is retried and the day succeeds — this
  is the exact boundary of the `attempt < MAX_RETRIES` guard.
- A URL returning 5xx on every attempt fails that day only; the remaining days
  of the range still crawl, `daysCrawled` still equals the range size and
  `daysFailed` reflects the lost day.
- A `fetch` that throws once, then resolves, is retried and the day succeeds.
- A 4xx response is not retried.
- `runCrawl` reports `daysFailed > 0` when any day fails; `bun run crawl` exits
  non-zero in that case.
- No failed day leaves an open `crawl_runs` row, so it cannot block the next
  run.

## Review findings addressed
- **Boundary case was untested.** The acceptance criterion names "5xx twice,
  then 200", but the test used a single 5xx. With `MAX_RETRIES = 2` the
  two-failure case is precisely the last permitted retry and was never
  exercised. Added as its own test. Confirmed to bind the guard: with
  `MAX_RETRIES = 1` the new test fails alongside the exhaustion test, with `2`
  both pass.
- **Unrelated file kept out of the commit.** `config/stations.json` (empty in
  HEAD since RDFY-001) is not in this ticket's references or criteria. It
  remains an uncommitted local change and needs its own ticket, which should
  also resolve the station-id divergence described below.
- **Duplicate backoff computation** hoisted to the top of the retry loop so
  both branches share one expression.

## Follow-ups this work surfaced
- **A failing request costs ~60 seconds.** The July log timestamps are
  consistent (16:26:07→16:27:07, 16:30:18→16:31:19, 16:31:37→16:32:37): the
  upstream runs into a 60s gateway timeout rather than answering quickly. With
  three attempts a permanently failing day now costs roughly three minutes of
  wall clock. Request timeouts were explicitly out of scope here; they are
  worth their own ticket.
- **429 is not treated as transient.** It falls into the 4xx bucket, which the
  ticket deliberately excluded, yet it is the one 4xx that is transient. A
  default run issues four stations × seven days × three windows = 84 requests
  to a single host, so this is reachable in normal operation.
- **Station ids diverge.** The play log holds rows under both `radio-zet` /
  `radio-eska` and `zet` / `eska` / `rmf` / `rmfmaxx` for the same stations, and
  `docs/operations/cron/crontab.example` still uses the older form. History is
  split across two identities.

Accepted as-is, with reasons recorded: the retry `catch` also retries
deterministic throws such as an invalid URL, because Bun's error shapes for
network failures are not stable enough to filter on and the ticket explicitly
requires thrown network errors to be retried — the cost is bounded at two extra
attempts.

## Verification
- `bunx biome check --write` per changed file — clean, no fixes applied.
- `bunx tsc --noEmit` — exit 0, no diagnostics.
- `bun test` — 276 pass / 1 skip / 0 fail, 1370 expect() calls across 38 files.
- Real run after the fix: `bun run crawl` over the default seven-day window for
  all four stations completed in 18s with zero errors and zero retries (the
  upstream was healthy), filling 9,198 plays into the sync window; the
  subsequent `bun run sync` wrote 2,915 tracks across the four playlists.
- Pre-commit hygiene: no secrets, tokens, personal identifiers, AI-authorship
  markers, database or log snapshots in the staged diff.
