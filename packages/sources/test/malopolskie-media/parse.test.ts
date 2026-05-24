import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../../src/malopolskie-media/parse.ts';

const fixturesDir = join(import.meta.dir, 'fixtures');
const loadFixture = (name: string): string => readFileSync(join(fixturesDir, name), 'utf-8');

describe('parse: live Radio ZET 2026-05-24 fixture', () => {
  const html = loadFixture('radio-zet-2026-05-24.html');
  const songs = parse({ html, station: 'radio-zet', day: '2026-05-24' });

  test('returns at least 100 songs (full day of broadcast)', () => {
    expect(songs.length).toBeGreaterThanOrEqual(100);
  });

  test('every song has a non-empty numeric sourceTrackId', () => {
    for (const song of songs) {
      expect(song.sourceTrackId).toMatch(/^\d+$/);
    }
  });

  test('first song matches the known Komodo entry', () => {
    const first = songs[0];
    expect(first?.sourceTrackId).toBe('86665');
    expect(first?.displayText).toBe('Komodo - (I Just) Died In Your Arms');
    expect(first?.artists).toEqual(['Komodo']);
    expect(first?.title).toBe('(I Just) Died In Your Arms');
  });

  test('multi-artist line splits on " / "', () => {
    const kayah = songs.find((s) => s.sourceTrackId === '49046');
    expect(kayah?.artists).toEqual(['Kayah', 'Grzegorz Hyży']);
    expect(kayah?.title).toBe('Podatek Od Miłości');
  });

  test('playedAt is valid UTC ISO-8601 with Z suffix', () => {
    for (const song of songs) {
      expect(song.playedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  test('first songs late-night in Europe/Warsaw map to previous UTC day', () => {
    const first = songs[0];
    expect(first?.playedAt).toBe('2026-05-23T22:08:00.000Z');
  });
});

describe('parse: empty playlist', () => {
  test('returns [] without throwing', () => {
    const html = loadFixture('empty.html');
    const songs = parse({ html, station: 'radio-zet', day: '2026-05-24' });
    expect(songs).toEqual([]);
  });
});

describe('parse: malformed rows', () => {
  test('skips bad rows and returns only the well-formed ones', () => {
    const html = loadFixture('malformed.html');
    const songs = parse({ html, station: 'radio-zet', day: '2026-05-24' });
    expect(songs).toHaveLength(2);
    expect(songs[0]?.sourceTrackId).toBe('86665');
    expect(songs[1]?.sourceTrackId).toBe('7570');
    expect(songs[1]?.artists).toEqual(['Ania Dąbrowska']);
    expect(songs[1]?.title).toBe('Porady Na Zdrady (Dreszcze)');
  });
});
