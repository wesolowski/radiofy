import { describe, expect, test } from 'bun:test';
import type { NormalizedSong } from '@radiofy/shared';
import { jaroWinkler } from '../src/jaro-winkler.ts';
import { type SpotifyTrackPayload, scoreCandidates } from '../src/score.ts';

const song = (primaryArtist: string, title: string): NormalizedSong => ({
  normalizedKey: `${primaryArtist.toLowerCase()}|${title.toLowerCase()}`,
  primaryArtist,
  allArtists: primaryArtist,
  title,
  originalArtists: [primaryArtist],
  originalTitle: title,
});

const track = (
  id: string,
  name: string,
  artistNames: string[],
  durationMs = 240_000,
): SpotifyTrackPayload => ({
  id,
  name,
  artists: artistNames.map((n, i) => ({ id: `a${i}`, name: n })),
  duration_ms: durationMs,
});

describe('scoreCandidates', () => {
  test('a clear top match for a popular English title scores >= 0.85', () => {
    const input = song('Komodo', '(I Just) Died In Your Arms');
    const items = [track('top', '(I Just) Died In Your Arms', ['Komodo'])];
    const scored = scoreCandidates({ song: input }, items);
    expect(scored).toHaveLength(1);
    expect(scored[0]?.score).toBeGreaterThanOrEqual(0.85);
  });

  test('candidates are returned in descending score order', () => {
    const input = song('Komodo', '(I Just) Died In Your Arms');
    const items = [
      track('a', '(I Just) Died In Your Arms', ['Komodo']),
      track('b', '(I Just) Died In Your Arms - Live', ['Komodo']),
      track('c', '(I Just) Died In Your Arms', ['Some Cover Band']),
    ];
    const scored = scoreCandidates({ song: input }, items);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1]?.score).toBeGreaterThanOrEqual(scored[i]?.score ?? 0);
    }
  });

  test('candidates with title similarity below 0.5 are dropped', () => {
    const inputTitle = 'Feel This Moment';
    const droppedTitle = 'Zxqv Bnp Lkj';
    expect(jaroWinkler(inputTitle.toLowerCase(), droppedTitle.toLowerCase())).toBeLessThan(0.5);

    const input = song('Pitbull', inputTitle);
    const items = [
      track('match', inputTitle, ['Pitbull', 'Christina Aguilera']),
      track('dropped', droppedTitle, ['Pitbull']),
    ];
    const scored = scoreCandidates({ song: input }, items);
    expect(scored.map((c) => c.spotifyTrackId)).toEqual(['match']);
  });

  test('Polish diacritics are folded before comparison', () => {
    const input = song('Hyży', 'Miłości');
    const items = [track('hit', 'Milosci', ['Hyzy'])];
    const scored = scoreCandidates({ song: input }, items);
    expect(scored[0]?.titleSimilarity).toBe(1);
    expect(scored[0]?.artistOverlap).toBe(1);
  });

  test('duration proximity boosts score when both durations are present', () => {
    const input = song('Komodo', 'Died In Your Arms');
    const exact = scoreCandidates({ song: input, durationMs: 240_000 }, [
      track('a', 'Died In Your Arms', ['Komodo'], 240_000),
    ]);
    const off = scoreCandidates({ song: input, durationMs: 240_000 }, [
      track('b', 'Died In Your Arms', ['Komodo'], 260_000),
    ]);
    expect(exact[0]?.score).toBeGreaterThan(off[0]?.score ?? 0);
  });

  test('returns [] for empty input list', () => {
    expect(scoreCandidates({ song: song('A', 'B') }, [])).toEqual([]);
  });
});
