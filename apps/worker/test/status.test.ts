import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Db,
  applyMigrations,
  crawlRunsRepo,
  matchesRepo,
  openInMemoryDb,
  songsRepo,
  syncRunsRepo,
  unmatchedRepo,
} from '@radiofy/database';
import { runStatus } from '../lib/status.ts';

const NOW = new Date('2026-05-26T12:00:00.000Z');
const fakeNow = (): Date => NOW;

let dir: string;
let stationsPath: string;
let db: Db;
let lines: string[];
const stdout = (line: string): void => {
  lines.push(line);
};

const writeStations = (rows: unknown[]): void => writeFileSync(stationsPath, JSON.stringify(rows));

const STATION = {
  id: 'radio-zet',
  name: 'ZET',
  source: 'malopolskie-media',
  sourceSlug: 'radio-zet',
  playlistName: 'Radio Zet Weekly Playlist',
  enabled: true,
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-status-'));
  stationsPath = join(dir, 'stations.json');
  writeStations([STATION]);
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  lines = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runStatus', () => {
  test('healthy station yields exit 0 with no_data → ok transition', () => {
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-25',
      startedAt: '2026-05-26T03:00:00.000Z',
    });
    crawlRunsRepo.close(db, 1, '2026-05-26T03:00:05.000Z', 200, null);
    const out = runStatus({ db, stationsPath, now: fakeNow, stdout });
    expect(out.exitCode).toBe(0);
    expect(out.report.stations[0]?.health).toBe('ok');
  });

  test('stale crawl (>36h old) sets exit 1', () => {
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-22',
      startedAt: '2026-05-23T00:00:00.000Z',
    });
    crawlRunsRepo.close(db, 1, '2026-05-23T00:00:05.000Z', 200, null);
    const out = runStatus({ db, stationsPath, now: fakeNow, stdout });
    expect(out.exitCode).toBe(1);
    expect(out.report.stations[0]?.health).toBe('stale');
  });

  test('never-crawled station is no_data, default does NOT exit 1', () => {
    const out = runStatus({ db, stationsPath, now: fakeNow, stdout });
    expect(out.report.stations[0]?.health).toBe('no_data');
    expect(out.exitCode).toBe(0);
  });

  test('--strict treats no_data as failure', () => {
    const out = runStatus({ db, stationsPath, now: fakeNow, strict: true, stdout });
    expect(out.exitCode).toBe(1);
  });

  test('stuck run forces exit 1', () => {
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-26',
      startedAt: '2026-05-26T11:00:00.000Z',
    });
    const out = runStatus({ db, stationsPath, now: fakeNow, stdout });
    expect(out.report.stuckRunsCount).toBe(1);
    expect(out.exitCode).toBe(1);
  });

  test('reports spotify_matches cache size and open unmatched count', () => {
    const song = songsRepo.upsertByNormalizedKey(db, {
      normalizedKey: 'a|b',
      primaryArtist: 'A',
      allArtists: 'A',
      title: 'B',
    });
    matchesRepo.upsert(db, {
      songId: song.id,
      spotifyTrackId: 'spotify:track:00000000000000000000aa',
      score: 0.9,
      matchedAt: NOW.toISOString(),
      sourceOfTruth: 'auto',
    });
    unmatchedRepo.upsertOccurrence(db, {
      normalizedKey: 'x|y',
      artist: 'X',
      title: 'Y',
      source: 'malopolskie-media',
      sourceTrackId: '1',
      station: 'radio-zet',
      firstSeenAt: NOW.toISOString(),
      lastSeenAt: NOW.toISOString(),
      reason: 'no_results',
    });
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-25',
      startedAt: '2026-05-26T03:00:00.000Z',
    });
    crawlRunsRepo.close(db, 1, '2026-05-26T03:00:05.000Z', 200, null);

    const out = runStatus({ db, stationsPath, now: fakeNow, stdout });
    expect(out.report.spotifyMatchesCacheSize).toBe(1);
    expect(out.report.totalOpenUnmatched).toBe(1);
  });

  test('disabled station reports health=disabled and is not counted as failure', () => {
    writeStations([{ ...STATION, enabled: false }]);
    const out = runStatus({ db, stationsPath, now: fakeNow, stdout });
    expect(out.report.stations[0]?.health).toBe('disabled');
    expect(out.exitCode).toBe(0);

    syncRunsRepo.open(db, {
      station: 'radio-zet',
      startedAt: '2026-05-26T03:00:00.000Z',
    });
    syncRunsRepo.close(db, 1, '2026-05-26T03:00:05.000Z', 50, null);
  });
});
