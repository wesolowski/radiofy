import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Db,
  applyMigrations,
  matchesRepo,
  openInMemoryDb,
  songsRepo,
  unmatchedRepo,
} from '@radiofy/database';
import type { NormalizedSong, RawSong } from '@radiofy/shared';
import type { ScoredCandidate } from '@radiofy/spotify';
import { SpotifyAuthExpiredError, SpotifyTransientError } from '@radiofy/spotify';
import { type OverrideTable, loadOverrides } from '../src/overrides.ts';
import { resolveSong } from '../src/resolve.ts';

const VALID_SPOTIFY = 'spotify:track:0jXQrPLm0jKZTXdQRZzj1n';

let db: Db;
let overridesDir: string;
let overridesPath: string;

const sampleRaw: RawSong = {
  sourceTrackId: '86665',
  displayText: 'Komodo - (I Just) Died In Your Arms',
  artists: ['Komodo'],
  title: '(I Just) Died In Your Arms',
  playedAt: '2026-05-24T00:08:00.000Z',
};

const sampleNormalized: NormalizedSong = {
  normalizedKey: 'komodo|(i just) died in your arms',
  primaryArtist: 'Komodo',
  allArtists: 'Komodo',
  title: '(I Just) Died In Your Arms',
  originalArtists: ['Komodo'],
  originalTitle: '(I Just) Died In Your Arms',
};

const writeOverrides = (overrides: unknown[]): OverrideTable => {
  writeFileSync(overridesPath, JSON.stringify({ overrides }));
  return loadOverrides(overridesPath);
};

const emptyOverrides = (): OverrideTable => loadOverrides(join(overridesDir, 'missing.json'));

const fakeCandidate = (id: string, score: number): ScoredCandidate => ({
  spotifyTrackId: id,
  trackName: 'name',
  artists: ['Komodo'],
  durationMs: 240_000,
  score,
  titleSimilarity: score,
  artistOverlap: 1,
});

const stubSearch = (candidates: ScoredCandidate[]) => async (): Promise<ScoredCandidate[]> =>
  candidates;

const stubSearchThrows = (err: Error) => async (): Promise<ScoredCandidate[]> => {
  throw err;
};

beforeEach(() => {
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  overridesDir = mkdtempSync(join(tmpdir(), 'radiofy-resolve-'));
  overridesPath = join(overridesDir, 'overrides.json');
});

afterEach(() => {
  rmSync(overridesDir, { recursive: true, force: true });
});

describe('resolveSong — override path', () => {
  test('override hit upserts spotify_matches with source_of_truth="manual" and beats live search', async () => {
    const overrides = writeOverrides([
      {
        match: { source: 'malopolskie-media', source_track_id: '86665' },
        spotify_id: VALID_SPOTIFY,
      },
    ]);
    let searchCalls = 0;
    const search = (async () => {
      searchCalls++;
      return [];
    }) as never;

    const outcome = await resolveSong({
      db,
      overrides,
      accessToken: 'token',
      source: 'malopolskie-media',
      station: 'radio-zet',
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      now: '2026-05-25T10:00:00.000Z',
      search,
    });

    expect(outcome).toEqual({ kind: 'override', spotifyTrackId: VALID_SPOTIFY });
    expect(searchCalls).toBe(0);

    const song = songsRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    expect(song?.id).toBeGreaterThan(0);
    const cached = matchesRepo.get(db, song?.id ?? -1);
    expect(cached?.spotifyTrackId).toBe(VALID_SPOTIFY);
    expect(cached?.sourceOfTruth).toBe('manual');
  });

  test('override hit sets resolved_at on a matching unmatched_songs row in the same transaction', async () => {
    unmatchedRepo.upsertOccurrence(db, {
      normalizedKey: sampleNormalized.normalizedKey,
      artist: sampleNormalized.primaryArtist,
      title: sampleNormalized.title,
      source: 'malopolskie-media',
      sourceTrackId: '86665',
      station: 'radio-zet',
      firstSeenAt: '2026-05-24T00:00:00.000Z',
      lastSeenAt: '2026-05-24T00:00:00.000Z',
      reason: 'no_results',
    });

    const overrides = writeOverrides([
      { match: { normalized_key: sampleNormalized.normalizedKey }, spotify_id: VALID_SPOTIFY },
    ]);

    await resolveSong({
      db,
      overrides,
      accessToken: 'token',
      source: 'malopolskie-media',
      station: 'radio-zet',
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      now: '2026-05-25T10:00:00.000Z',
      search: stubSearch([]) as never,
    });

    const row = unmatchedRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    expect(row?.resolvedAt).toBe('2026-05-25T10:00:00.000Z');
  });
});

describe('resolveSong — cache path', () => {
  test('cache hit returns without calling Spotify', async () => {
    const song = songsRepo.upsertByNormalizedKey(db, {
      normalizedKey: sampleNormalized.normalizedKey,
      primaryArtist: sampleNormalized.primaryArtist,
      allArtists: sampleNormalized.allArtists,
      title: sampleNormalized.title,
    });
    matchesRepo.upsert(db, {
      songId: song.id,
      spotifyTrackId: 'spotify:track:cached0000000000000000',
      score: 0.92,
      matchedAt: '2026-05-24T00:00:00.000Z',
      sourceOfTruth: 'auto',
    });

    let searchCalls = 0;
    const search = (async () => {
      searchCalls++;
      return [];
    }) as never;

    const outcome = await resolveSong({
      db,
      overrides: emptyOverrides(),
      accessToken: 'token',
      source: 'malopolskie-media',
      station: 'radio-zet',
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      search,
    });

    expect(outcome).toEqual({
      kind: 'cache',
      spotifyTrackId: 'spotify:track:cached0000000000000000',
    });
    expect(searchCalls).toBe(0);
  });
});

describe('resolveSong — auto match path', () => {
  test('top candidate >= 0.85 writes spotify_matches with source_of_truth="auto"', async () => {
    const outcome = await resolveSong({
      db,
      overrides: emptyOverrides(),
      accessToken: 'token',
      source: 'malopolskie-media',
      station: 'radio-zet',
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      now: '2026-05-25T10:00:00.000Z',
      search: stubSearch([fakeCandidate('spotify:track:autoauto0000000000000000', 0.92)]) as never,
    });

    expect(outcome.kind).toBe('auto');
    const song = songsRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    const cached = matchesRepo.get(db, song?.id ?? -1);
    expect(cached?.sourceOfTruth).toBe('auto');
    expect(cached?.spotifyTrackId).toBe('spotify:track:autoauto0000000000000000');
    expect(unmatchedRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey)).toBeUndefined();
  });
});

describe('resolveSong — low confidence path', () => {
  test('top candidate in [0.6, 0.85) writes unmatched_songs with reason=low_confidence and best_candidate_*', async () => {
    const candidate = fakeCandidate('spotify:track:lowconflowconflowconfeg', 0.72);
    const outcome = await resolveSong({
      db,
      overrides: emptyOverrides(),
      accessToken: 'token',
      source: 'malopolskie-media',
      station: 'radio-zet',
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      now: '2026-05-25T10:00:00.000Z',
      search: stubSearch([candidate]) as never,
    });

    expect(outcome.kind).toBe('low_confidence');
    expect(matchesRepo.get(db, 1)).toBeUndefined();
    const row = unmatchedRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    expect(row?.reason).toBe('low_confidence');
    expect(row?.bestCandidateSpotifyId).toBe('spotify:track:lowconflowconflowconfeg');
    expect(row?.bestCandidateScore).toBeCloseTo(0.72, 2);
  });

  test('repeat low-confidence sighting bumps occurrence_count and last_seen_at', async () => {
    const candidate = fakeCandidate('spotify:track:lowconflowconflowconfeg', 0.72);
    const ctxBase = {
      db,
      overrides: emptyOverrides(),
      accessToken: 'token',
      source: 'malopolskie-media' as const,
      station: 'radio-zet' as const,
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      search: stubSearch([candidate]) as never,
    };

    await resolveSong({ ...ctxBase, now: '2026-05-24T00:00:00.000Z' });
    await resolveSong({ ...ctxBase, now: '2026-05-25T00:00:00.000Z' });

    const row = unmatchedRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    expect(row?.occurrenceCount).toBe(2);
    expect(row?.lastSeenAt).toBe('2026-05-25T00:00:00.000Z');
  });
});

describe('resolveSong — no-results path', () => {
  test('empty candidate list writes unmatched_songs with reason=no_results', async () => {
    const outcome = await resolveSong({
      db,
      overrides: emptyOverrides(),
      accessToken: 'token',
      source: 'malopolskie-media',
      station: 'radio-zet',
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      now: '2026-05-25T10:00:00.000Z',
      search: stubSearch([]) as never,
    });

    expect(outcome).toEqual({ kind: 'no_results' });
    const row = unmatchedRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    expect(row?.reason).toBe('no_results');
    expect(row?.bestCandidateSpotifyId).toBeNull();
  });
});

describe('resolveSong — api_error path', () => {
  test('SpotifyTransientError caught, written as api_error, function returns api_error', async () => {
    const outcome = await resolveSong({
      db,
      overrides: emptyOverrides(),
      accessToken: 'token',
      source: 'malopolskie-media',
      station: 'radio-zet',
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      now: '2026-05-25T10:00:00.000Z',
      search: stubSearchThrows(new SpotifyTransientError('500 from Spotify', 500)) as never,
    });

    expect(outcome.kind).toBe('api_error');
    const row = unmatchedRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    expect(row?.reason).toBe('api_error');
  });

  test('SpotifyAuthExpiredError propagates (no DB write of api_error)', async () => {
    await expect(
      resolveSong({
        db,
        overrides: emptyOverrides(),
        accessToken: 'token',
        source: 'malopolskie-media',
        station: 'radio-zet',
        rawSong: sampleRaw,
        normalized: sampleNormalized,
        search: stubSearchThrows(new SpotifyAuthExpiredError()) as never,
      }),
    ).rejects.toBeInstanceOf(SpotifyAuthExpiredError);
  });
});

describe('resolveSong — override beats cache on re-run', () => {
  test('after override is added, subsequent resolve uses it without Spotify call', async () => {
    let searchCalls = 0;
    const noSearch = (async () => {
      searchCalls++;
      return [];
    }) as never;
    const ctxBase = {
      db,
      accessToken: 'token',
      source: 'malopolskie-media' as const,
      station: 'radio-zet' as const,
      rawSong: sampleRaw,
      normalized: sampleNormalized,
      search: noSearch,
    };

    await resolveSong({ ...ctxBase, overrides: emptyOverrides(), now: '2026-05-24T00:00:00.000Z' });
    expect(searchCalls).toBe(1);

    const overrides = writeOverrides([
      {
        match: { source: 'malopolskie-media', source_track_id: '86665' },
        spotify_id: VALID_SPOTIFY,
      },
    ]);
    const second = await resolveSong({
      ...ctxBase,
      overrides,
      now: '2026-05-25T00:00:00.000Z',
    });

    expect(second).toEqual({ kind: 'override', spotifyTrackId: VALID_SPOTIFY });
    expect(searchCalls).toBe(1);

    const row = unmatchedRepo.getByNormalizedKey(db, sampleNormalized.normalizedKey);
    expect(row?.resolvedAt).toBe('2026-05-25T00:00:00.000Z');
  });
});
