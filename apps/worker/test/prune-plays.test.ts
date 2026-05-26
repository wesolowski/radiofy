import { beforeEach, describe, expect, test } from 'bun:test';
import { type Db, applyMigrations, openInMemoryDb, playsRepo, songsRepo } from '@radiofy/database';
import { runPrunePlays } from '../lib/prune-plays.ts';

const NOW = new Date('2026-05-26T12:00:00.000Z');
const fakeNow = (): Date => NOW;

let db: Db;
let lines: string[];
const stdout = (line: string): void => {
  lines.push(line);
};

const seedPlay = (songId: number, playedAt: string, sourceTrackId: string): void => {
  playsRepo.insert(db, {
    source: 'odsluchane-eu',
    sourceTrackId,
    station: 'radio-zet',
    songId,
    playedAt,
    crawledAt: '2026-05-26T03:00:00.000Z',
  });
};

beforeEach(() => {
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  lines = [];

  const song = songsRepo.upsertByNormalizedKey(db, {
    normalizedKey: 'a|x',
    primaryArtist: 'A',
    allArtists: 'A',
    title: 'X',
  });
  seedPlay(song.id, '2026-01-01T00:00:00.000Z', '100');
  seedPlay(song.id, '2026-03-15T00:00:00.000Z', '101');
  seedPlay(song.id, '2026-05-01T00:00:00.000Z', '102');
  seedPlay(song.id, '2026-05-25T00:00:00.000Z', '103');
});

describe('runPrunePlays', () => {
  test('--dry-run reports the count without deleting', () => {
    const out = runPrunePlays({ db, keepDays: 30, dryRun: true, now: fakeNow, stdout });
    expect(out.dryRun).toBe(true);
    expect(out.plays).toBe(2);
    expect(playsRepo.countByStationInWindow(db, 'radio-zet', '1900-01-01', '2099-01-01')).toBe(4);
  });

  test('keep-days=30 actually deletes rows older than 30 days', () => {
    runPrunePlays({ db, keepDays: 30, now: fakeNow, stdout });
    expect(playsRepo.countByStationInWindow(db, 'radio-zet', '1900-01-01', '2099-01-01')).toBe(2);
  });

  test('keep-days=200 keeps everything in the test fixture', () => {
    const out = runPrunePlays({ db, keepDays: 200, dryRun: true, now: fakeNow, stdout });
    expect(out.plays).toBe(0);
  });

  test('keep-days=0 throws (refuses delete-everything)', () => {
    expect(() => runPrunePlays({ db, keepDays: 0, now: fakeNow, stdout })).toThrow(
      /positive integer/,
    );
  });

  test('non-integer keep-days throws', () => {
    expect(() => runPrunePlays({ db, keepDays: 1.5, now: fakeNow, stdout })).toThrow();
  });
});
