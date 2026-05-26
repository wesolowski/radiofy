import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Db, applyMigrations, openInMemoryDb, playsRepo, songsRepo } from '@radiofy/database';
import { runTopPlayed } from '../lib/top-played.ts';

const STATION = {
  id: 'radio-zet',
  name: 'ZET',
  source: 'odsluchane-eu',
  sourceSlug: '1',
  playlistName: 'Radio Zet Weekly Playlist',
  enabled: true,
};

const NOW = new Date('2026-05-26T12:00:00.000Z');
const fakeNow = (): Date => NOW;

let dir: string;
let stationsPath: string;
let db: Db;
let lines: string[];
const stdout = (line: string): void => {
  lines.push(line);
};

const seedSong = (key: string, artist: string, title: string): number =>
  songsRepo.upsertByNormalizedKey(db, {
    normalizedKey: key,
    primaryArtist: artist,
    allArtists: artist,
    title,
  }).id;

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
  dir = mkdtempSync(join(tmpdir(), 'radiofy-top-'));
  stationsPath = join(dir, 'stations.json');
  writeFileSync(stationsPath, JSON.stringify([STATION]));
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  lines = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runTopPlayed', () => {
  test('ranks songs by play count descending and respects --limit', () => {
    const a = seedSong('a|x', 'A', 'X');
    const b = seedSong('b|y', 'B', 'Y');
    const c = seedSong('c|z', 'C', 'Z');
    for (let i = 0; i < 3; i++) seedPlay(a, `2026-05-25T0${i}:00:00.000Z`, '100');
    for (let i = 0; i < 5; i++) seedPlay(b, `2026-05-25T0${i}:30:00.000Z`, '200');
    for (let i = 0; i < 1; i++) seedPlay(c, `2026-05-25T0${i}:45:00.000Z`, '300');

    const out = runTopPlayed({ db, stationsPath, limit: 2, now: fakeNow, stdout, color: false });

    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0]?.rows.map((r) => `${r.plays}:${r.primaryArtist}`)).toEqual(['5:B', '3:A']);
  });

  test('defaults to a 7-day rolling window', () => {
    const a = seedSong('a|x', 'A', 'X');
    seedPlay(a, '2026-05-25T00:00:00.000Z', '100');
    seedPlay(a, '2026-04-01T00:00:00.000Z', '100');

    const out = runTopPlayed({ db, stationsPath, now: fakeNow, stdout, color: false });
    expect(out.blocks[0]?.rows[0]?.plays).toBe(1);
  });

  test('--since overrides the default window', () => {
    const a = seedSong('a|x', 'A', 'X');
    seedPlay(a, '2026-05-25T00:00:00.000Z', '100');
    seedPlay(a, '2026-04-01T00:00:00.000Z', '100');

    const out = runTopPlayed({
      db,
      stationsPath,
      now: fakeNow,
      stdout,
      color: false,
      since: '2026-01-01',
    });
    expect(out.blocks[0]?.rows[0]?.plays).toBe(2);
  });

  test('--station filters to one station and skips disabled ones', () => {
    writeFileSync(
      stationsPath,
      JSON.stringify([
        STATION,
        { ...STATION, id: 'rmf-fm', name: 'RMF FM' },
        { ...STATION, id: 'disabled', name: 'Off', enabled: false },
      ]),
    );
    const out = runTopPlayed({
      db,
      stationsPath,
      station: 'radio-zet',
      now: fakeNow,
      stdout,
      color: false,
    });
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0]?.station.id).toBe('radio-zet');
  });

  test('renders no-color output when color=false (safe to pipe)', () => {
    runTopPlayed({ db, stationsPath, now: fakeNow, stdout, color: false });
    const ansiEscape = String.fromCharCode(27);
    for (const line of lines) {
      expect(line).not.toContain(ansiEscape);
    }
  });

  test('an empty window yields a "no plays in window" line', () => {
    runTopPlayed({ db, stationsPath, now: fakeNow, stdout, color: false });
    expect(lines.some((l) => l.includes('no plays in window'))).toBe(true);
  });
});
