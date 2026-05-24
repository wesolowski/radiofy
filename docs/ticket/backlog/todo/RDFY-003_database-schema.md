# [RDFY-003] Database package — Drizzle schema, migrations, repositories

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
Every other component reads or writes through this package. Getting the schema right before any consumer is built avoids painful migrations later. The schema is fully specified in the architecture document under "Database Strategy" and "Unmatched Songs Tracking".

## Scope
- **In scope**:
  - `schema.ts`: Drizzle definitions for `plays`, `songs`, `spotify_matches`, `unmatched_songs`, `crawl_runs`, `playlist_sync_runs`
  - All indexes and unique constraints from the architecture
  - `migrations/0001_initial.sql` generated via Drizzle Kit
  - Repository functions: `playsRepo`, `songsRepo`, `matchesRepo`, `unmatchedRepo`, `crawlRunsRepo`, `syncRunsRepo` — minimal CRUD only what later tickets will need
  - Transaction helper `withTransaction(db, fn)` that wraps multiple writes
- **Out of scope (explicit)**: any normalization logic, any Spotify ID validation, any data import. No CLI commands (those live in `apps/worker`).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Database Strategy", "Unmatched Songs Tracking"
- `RDFY-001`, `RDFY-002`

## Acceptance Criteria
- [ ] `bunx drizzle-kit generate` produces a clean migration matching `schema.ts`
- [ ] Running migrations against an empty `:memory:` SQLite creates all six tables and all indexes
- [ ] Unique constraint on `plays(source, source_track_id, station, played_at)` is enforced — inserting a duplicate throws
- [ ] `unmatched_songs.normalized_key` UNIQUE constraint is enforced
- [ ] **Partial index `idx_unmatched_open` exists on `unmatched_songs(resolved_at) WHERE resolved_at IS NULL`**. Drizzle's SQLite support for partial indexes is non-trivial — if the ORM helper cannot express the `WHERE` clause, fall back to a raw-SQL migration. Verified by querying `sqlite_master` for the index DDL.
- [ ] `EXPLAIN QUERY PLAN SELECT * FROM unmatched_songs WHERE resolved_at IS NULL` uses `idx_unmatched_open` (test asserts on the plan text)
- [ ] `withTransaction` rolls back on thrown error (covered by a test)
- [ ] `bun test packages/database/test/` passes with both happy and constraint-violation cases

## Verification (manual)
1. `bunx drizzle-kit migrate` on a fresh DB → six tables visible via `bunx drizzle-kit studio`
2. Insert a play row twice with identical key → second insert errors with a UNIQUE message
3. Drop a table manually, re-run migrate → recreated cleanly
