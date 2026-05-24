import { beforeEach, describe, expect, test } from 'bun:test';
import { type Db, applyMigrations, openInMemoryDb } from '../src/db.ts';
import { crawlRunsRepo } from '../src/repos/crawl-runs.ts';
import { matchesRepo } from '../src/repos/matches.ts';
import { songsRepo } from '../src/repos/songs.ts';
import { unmatchedRepo } from '../src/repos/unmatched.ts';

let db: Db;

beforeEach(() => {
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
});

describe('songsRepo', () => {
  test('upserts by normalized_key and returns the row', () => {
    const inserted = songsRepo.upsertByNormalizedKey(db, {
      normalizedKey: 'kayah|podatek od milosci',
      primaryArtist: 'Kayah',
      allArtists: 'Kayah|Grzegorz Hyży',
      title: 'Podatek Od Miłości',
    });
    expect(inserted.id).toBeGreaterThan(0);

    const updated = songsRepo.upsertByNormalizedKey(db, {
      normalizedKey: 'kayah|podatek od milosci',
      primaryArtist: 'Kayah',
      allArtists: 'Kayah|Grzegorz Hyży',
      title: 'Podatek od Miłości (Remastered)',
    });
    expect(updated.id).toBe(inserted.id);
    expect(updated.title).toBe('Podatek od Miłości (Remastered)');
  });
});

describe('unmatchedRepo', () => {
  test('upsertOccurrence bumps occurrence_count on conflict', () => {
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
    unmatchedRepo.upsertOccurrence(db, row);
    unmatchedRepo.upsertOccurrence(db, { ...row, lastSeenAt: '2026-05-25T01:00:00.000Z' });
    const got = unmatchedRepo.getByNormalizedKey(db, 'unknown|track');
    expect(got?.occurrenceCount).toBe(2);
    expect(got?.lastSeenAt).toBe('2026-05-25T01:00:00.000Z');
  });

  test('listOpen excludes resolved rows', () => {
    unmatchedRepo.upsertOccurrence(db, {
      normalizedKey: 'a|b',
      artist: 'A',
      title: 'B',
      source: 'malopolskie-media',
      station: 'radio-zet',
      firstSeenAt: '2026-05-24T00:00:00.000Z',
      lastSeenAt: '2026-05-24T00:00:00.000Z',
      reason: 'no_results',
    });
    unmatchedRepo.upsertOccurrence(db, {
      normalizedKey: 'c|d',
      artist: 'C',
      title: 'D',
      source: 'malopolskie-media',
      station: 'radio-zet',
      firstSeenAt: '2026-05-24T00:00:00.000Z',
      lastSeenAt: '2026-05-24T00:00:00.000Z',
      reason: 'no_results',
    });
    unmatchedRepo.markResolved(db, 'c|d', '2026-05-25T00:00:00.000Z');
    const open = unmatchedRepo.listOpen(db);
    expect(open).toHaveLength(1);
    expect(open[0]?.normalizedKey).toBe('a|b');
  });
});

describe('matchesRepo', () => {
  test('upserts and returns by song_id', () => {
    const song = songsRepo.upsertByNormalizedKey(db, {
      normalizedKey: 'k|p',
      primaryArtist: 'K',
      allArtists: 'K',
      title: 'P',
    });
    matchesRepo.upsert(db, {
      songId: song.id,
      spotifyTrackId: '0jXQrPLm0jKZTXdQRZzj1n',
      score: 0.92,
      matchedAt: '2026-05-24T03:00:00.000Z',
      sourceOfTruth: 'auto',
    });
    const got = matchesRepo.get(db, song.id);
    expect(got?.spotifyTrackId).toBe('0jXQrPLm0jKZTXdQRZzj1n');
  });
});

describe('crawlRunsRepo', () => {
  test('open / close lifecycle with stuck detection', () => {
    const run = crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-24',
      startedAt: '2026-05-24T03:00:00.000Z',
    });
    expect(run.id).toBeGreaterThan(0);

    const open = crawlRunsRepo.findOpen(db, 'radio-zet');
    expect(open).toHaveLength(1);

    crawlRunsRepo.close(db, run.id, '2026-05-24T03:00:05.000Z', 248, null);
    const afterClose = crawlRunsRepo.findOpen(db, 'radio-zet');
    expect(afterClose).toHaveLength(0);
  });

  test('findStuckOlderThan returns only runs older than the cutoff and still open', () => {
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-24',
      startedAt: '2026-05-24T01:00:00.000Z',
    });
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-24',
      startedAt: '2026-05-24T05:00:00.000Z',
    });
    const stuck = crawlRunsRepo.findStuckOlderThan(db, '2026-05-24T03:00:00.000Z');
    expect(stuck).toHaveLength(1);
    expect(stuck[0]?.startedAt).toBe('2026-05-24T01:00:00.000Z');
  });
});
