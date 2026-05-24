import { describe, expect, test } from 'bun:test';
import type { RawSong } from '@radiofy/shared';
import { normalize, normalizeKeyOnly } from '../src/normalize.ts';

const makeRaw = (artists: string[], title: string): RawSong => ({
  sourceTrackId: '00000',
  displayText: `${artists.join(' / ')} - ${title}`,
  artists,
  title,
  playedAt: '2026-05-24T00:00:00.000Z',
});

describe('normalize — ticket acceptance cases', () => {
  test('Kayah / Grzegorz Hyży example yields the documented key', () => {
    const out = normalize(makeRaw(['Kayah', 'Grzegorz Hyży'], 'Podatek Od Miłości'));
    expect(out.normalizedKey).toBe('kayah|podatek od milosci');
  });

  test('diacritic-only difference collapses to the same key', () => {
    const a = normalize(makeRaw(['Hyży'], 'Miłości'));
    const b = normalize(makeRaw(['Hyzy'], 'Milosci'));
    expect(a.normalizedKey).toBe(b.normalizedKey);
  });

  test('feat./ft./featuring marker plus parenthetical noise are stripped', () => {
    const out = normalize(
      makeRaw(['Pitbull feat. Christina Aguilera'], 'Feel This Moment (Radio Edit)'),
    );
    expect(out.normalizedKey).toBe('pitbull|feel this moment');
  });

  test('original strings preserved verbatim in the returned object', () => {
    const raw = makeRaw(['Pitbull feat. Christina Aguilera'], 'Feel This Moment (Radio Edit)');
    const out = normalize(raw);
    expect(out.primaryArtist).toBe('Pitbull feat. Christina Aguilera');
    expect(out.title).toBe('Feel This Moment (Radio Edit)');
    expect(out.originalArtists).toEqual(['Pitbull feat. Christina Aguilera']);
    expect(out.originalTitle).toBe('Feel This Moment (Radio Edit)');
    expect(out.allArtists).toBe('Pitbull feat. Christina Aguilera');
  });

  test('purity — same input twice yields equal output', () => {
    const raw = makeRaw(['A'], 'B');
    expect(normalize(raw)).toEqual(normalize(raw));
  });
});

describe('normalize — featuring marker variants', () => {
  test.each([
    ['Artist feat. Other', 'artist'],
    ['Artist ft. Other', 'artist'],
    ['Artist FEAT. Other', 'artist'],
    ['Artist featuring Other', 'artist'],
    ['Artist Feat Other', 'artist'],
  ])('"%s" → "%s"', (input, expectedArtistKey) => {
    const out = normalize(makeRaw([input], 'Track'));
    expect(out.normalizedKey).toBe(`${expectedArtistKey}|track`);
  });
});

describe('normalize — parenthetical noise list', () => {
  test.each([
    ['Track (Radio Edit)', 'track'],
    ['Track (Original Mix)', 'track'],
    ['Track [Bonus Track]', 'track'],
    ['Track (Remix)', 'track'],
  ])('"%s" title strips to "%s"', (title, expected) => {
    const out = normalize(makeRaw(['Artist'], title));
    expect(out.normalizedKey).toBe(`artist|${expected}`);
  });

  test('non-noise parenthetical is preserved (e.g. "(I Just)")', () => {
    const out = normalize(makeRaw(['Komodo'], '(I Just) Died In Your Arms'));
    expect(out.normalizedKey).toBe('komodo|(i just) died in your arms');
  });

  test('a non-standalone "remix" in a longer parenthetical is preserved', () => {
    const out = normalize(makeRaw(['Artist'], 'Track (House Remix)'));
    expect(out.normalizedKey).toBe('artist|track (house remix)');
  });
});

describe('normalize — whitespace, ampersand, case', () => {
  test('& and &amp; both become "and"', () => {
    expect(normalize(makeRaw(['AC&DC'], 'Track')).normalizedKey).toBe('ac and dc|track');
    expect(normalize(makeRaw(['AC&amp;DC'], 'Track')).normalizedKey).toBe('ac and dc|track');
  });

  test('duplicate whitespace collapses', () => {
    const out = normalize(makeRaw(['Artist'], 'Track   With    Spaces'));
    expect(out.normalizedKey).toBe('artist|track with spaces');
  });
});

describe('normalize — real ZET fixture titles', () => {
  test.each([
    [['Komodo'], '(I Just) Died In Your Arms', 'komodo|(i just) died in your arms'],
    [['Damiano David'], 'The First Time', 'damiano david|the first time'],
    [['Kayah', 'Grzegorz Hyży'], 'Podatek Od Miłości', 'kayah|podatek od milosci'],
    [
      ['Ania Dąbrowska'],
      'Porady Na Zdrady (Dreszcze)',
      'ania dabrowska|porady na zdrady (dreszcze)',
    ],
    [['IRA'], 'Dlaczego Nic', 'ira|dlaczego nic'],
    [['Sylwia Grzeszczak', 'Liber'], 'Dobre Myśli', 'sylwia grzeszczak|dobre mysli'],
  ])('%j / %s → %s', (artists, title, expected) => {
    const out = normalize(makeRaw(artists as string[], title as string));
    expect(out.normalizedKey).toBe(expected);
  });
});

describe('normalizeKeyOnly helper', () => {
  test('produces the same key as normalize() does for the same artist+title', () => {
    const raw = makeRaw(['Kayah'], 'Podatek Od Miłości');
    expect(normalizeKeyOnly('Kayah', 'Podatek Od Miłości')).toBe(normalize(raw).normalizedKey);
  });
});
