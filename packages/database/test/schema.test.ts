import { beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { type Db, applyMigrations, openInMemoryDb } from '../src/db.ts';
import { plays, songs, unmatchedSongs } from '../src/schema.ts';

let db: Db;

beforeEach(() => {
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
});

describe('migrations', () => {
  test('creates all six tables', () => {
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'`,
    );
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual([
      'crawl_runs',
      'playlist_sync_runs',
      'plays',
      'songs',
      'spotify_matches',
      'unmatched_songs',
    ]);
  });
});

describe('plays unique constraint', () => {
  test('rejects a duplicate (source, source_track_id, station, played_at)', () => {
    db.insert(songs)
      .values({
        normalizedKey: 'a|b',
        primaryArtist: 'A',
        allArtists: 'A',
        title: 'B',
      })
      .run();
    const row = {
      source: 'malopolskie-media',
      sourceTrackId: '86665',
      station: 'radio-zet',
      songId: 1,
      playedAt: '2026-05-24T00:08:00.000Z',
      crawledAt: '2026-05-24T03:00:00.000Z',
    };
    db.insert(plays).values(row).run();
    expect(() => db.insert(plays).values(row).run()).toThrow(/UNIQUE/);
  });
});

describe('unmatched_songs unique constraint', () => {
  test('rejects a duplicate normalized_key', () => {
    const row = {
      normalizedKey: 'unknown|track',
      artist: 'Unknown',
      title: 'Track',
      source: 'malopolskie-media',
      station: 'radio-zet',
      firstSeenAt: '2026-05-24T00:00:00.000Z',
      lastSeenAt: '2026-05-24T00:00:00.000Z',
      reason: 'no_results' as const,
    };
    db.insert(unmatchedSongs).values(row).run();
    expect(() => db.insert(unmatchedSongs).values(row).run()).toThrow(/UNIQUE/);
  });
});

describe('partial index idx_unmatched_open', () => {
  test('exists in sqlite_master with the right WHERE clause', () => {
    const rows = db.all<{ sql: string }>(
      sql`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_unmatched_open'`,
    );
    const row = rows[0];
    expect(row?.sql).toBeDefined();
    expect(row?.sql).toContain('resolved_at');
    expect(row?.sql).toContain('IS NULL');
  });

  test('the query planner uses idx_unmatched_open for open-row scans', () => {
    const plan = db.all<{ detail: string }>(
      sql`EXPLAIN QUERY PLAN SELECT * FROM unmatched_songs WHERE resolved_at IS NULL`,
    );
    const text = plan.map((p) => p.detail).join('\n');
    expect(text).toContain('idx_unmatched_open');
  });
});
