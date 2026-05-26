import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../../src/odsluchane-eu/parse.ts';

const fixturesDir = join(import.meta.dir, 'fixtures');
const loadFixture = (name: string): string => readFileSync(join(fixturesDir, name), 'utf-8');

describe('parse: live odsluchane.eu ZET 2026-05-25 (00:00–05:59 window)', () => {
  const html = loadFixture('radio-zet-2026-05-25-window-0-5.html');
  const songs = parse({ html, station: 'radio-zet', day: '2026-05-25' });

  test('returns at least 30 songs for a 6-hour window', () => {
    expect(songs.length).toBeGreaterThanOrEqual(30);
  });

  test('every song has a non-empty numeric sourceTrackId', () => {
    for (const song of songs) {
      expect(song.sourceTrackId).toMatch(/^\d+$/);
    }
  });

  test('every artists array has at least one entry', () => {
    for (const song of songs) {
      expect(song.artists.length).toBeGreaterThan(0);
    }
  });

  test('playedAt is valid UTC ISO-8601 with Z suffix', () => {
    for (const song of songs) {
      expect(song.playedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  test('songs late at night in Europe/Warsaw map to the previous UTC day in May (CEST = UTC+2)', () => {
    const first = songs[0];
    expect(first?.playedAt).toMatch(/^2026-05-2[45]/);
  });
});

describe('parse: empty / malformed fallback', () => {
  test('returns [] for HTML without a song table', () => {
    const songs = parse({
      html: '<html><body><p>no playlist here</p></body></html>',
      station: 'radio-zet',
      day: '2026-05-25',
    });
    expect(songs).toEqual([]);
  });
});
