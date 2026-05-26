import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Db,
  applyMigrations,
  matchesRepo,
  openInMemoryDb,
  playsRepo,
  songsRepo,
  syncRunsRepo,
} from '@radiofy/database';
import { runSync } from '../lib/sync.ts';

const ENABLED_STATION = {
  id: 'radio-zet',
  name: 'ZET',
  source: 'malopolskie-media',
  sourceSlug: 'radio-zet',
  playlistName: 'Radio Zet Weekly Playlist',
  enabled: true,
};

let dir: string;
let stationsPath: string;
let overridesPath: string;
let db: Db;
let originalFetch: typeof globalThis.fetch;
let fetchCalls: { url: string; method: string; body: string | null }[];

const installFetch = (
  responder: (url: string, method: string) => Response | Promise<Response>,
): void => {
  fetchCalls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const method = init?.method ?? 'GET';
    const body = init?.body === undefined ? null : String(init.body);
    fetchCalls.push({ url: resolved, method, body });
    return responder(resolved, method);
  }) as typeof globalThis.fetch;
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-sync-'));
  stationsPath = join(dir, 'stations.json');
  overridesPath = join(dir, 'overrides.json');
  writeFileSync(stationsPath, JSON.stringify([ENABLED_STATION]));
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

const seedSong = (normalizedKey: string, primaryArtist: string, title: string): number => {
  return songsRepo.upsertByNormalizedKey(db, {
    normalizedKey,
    primaryArtist,
    allArtists: primaryArtist,
    title,
  }).id;
};

const seedCachedMatch = (songId: number, spotifyTrackId: string, score = 0.95): void => {
  matchesRepo.upsert(db, {
    songId,
    spotifyTrackId,
    score,
    matchedAt: '2026-05-24T00:00:00.000Z',
    sourceOfTruth: 'auto',
  });
};

const seedPlay = (songId: number, playedAt: string, sourceTrackId: string): void => {
  playsRepo.insert(db, {
    source: 'malopolskie-media',
    sourceTrackId,
    station: 'radio-zet',
    songId,
    playedAt,
    crawledAt: '2026-05-25T03:00:00.000Z',
  });
};

const fakeNow = (): Date => new Date('2026-05-25T04:00:00.000Z');

describe('runSync', () => {
  test('happy path: cached matches → playlist replace with top-N tracks', async () => {
    const s1 = seedSong('a|x', 'A', 'X');
    const s2 = seedSong('b|y', 'B', 'Y');
    seedCachedMatch(s1, 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa');
    seedCachedMatch(s2, 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb');
    seedPlay(s1, '2026-05-24T01:00:00.000Z', '101');
    seedPlay(s1, '2026-05-24T02:00:00.000Z', '101');
    seedPlay(s2, '2026-05-24T03:00:00.000Z', '202');

    installFetch(async (url, method) => {
      if (url.includes('/v1/me/playlists')) {
        return jsonResponse({
          items: [{ id: 'PID', name: 'Radio Zet Weekly Playlist' }],
          next: null,
        });
      }
      if (method === 'PUT' && url.includes('/v1/playlists/PID/tracks')) {
        return jsonResponse({ snapshot_id: 'snap-cleared' });
      }
      if (method === 'POST' && url.includes('/v1/playlists/PID/tracks')) {
        return jsonResponse({ snapshot_id: 'snap-added' });
      }
      return jsonResponse({}, 404);
    });

    const outcome = await runSync({
      station: 'radio-zet',
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.tracksWritten).toBe(2);
      expect(outcome.snapshotId).toBe('snap-added');
    }

    const putCall = fetchCalls.find((c) => c.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(JSON.parse(putCall?.body ?? '{}').uris).toEqual([]);

    const postCall = fetchCalls.find((c) => c.method === 'POST');
    expect(postCall).toBeDefined();
    const postBody = JSON.parse(postCall?.body ?? '{}');
    expect(postBody.uris[0]).toBe('spotify:track:aaaaaaaaaaaaaaaaaaaaaa');
    expect(postBody.uris[1]).toBe('spotify:track:bbbbbbbbbbbbbbbbbbbbbb');
  });

  test('returns no_songs when nothing in the window resolves — no playlist call', async () => {
    let putCalled = false;
    installFetch(async (url, method) => {
      if (method === 'PUT') putCalled = true;
      return jsonResponse({ items: [], next: null });
    });
    const outcome = await runSync({
      station: 'radio-zet',
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });
    expect(outcome.kind).toBe('no_songs');
    expect(putCalled).toBe(false);
  });

  test('returns playlist_not_found if the target playlist does not exist', async () => {
    const s1 = seedSong('a|x', 'A', 'X');
    seedCachedMatch(s1, 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa');
    seedPlay(s1, '2026-05-24T01:00:00.000Z', '101');

    installFetch(async () =>
      jsonResponse({ items: [{ id: 'other', name: 'Other Playlist' }], next: null }),
    );

    const outcome = await runSync({
      station: 'radio-zet',
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });
    expect(outcome.kind).toBe('playlist_not_found');
  });

  test('blocks when another sync run is already in flight within the cutoff', async () => {
    syncRunsRepo.open(db, {
      station: 'radio-zet',
      startedAt: '2026-05-25T03:59:00.000Z',
    });
    const outcome = await runSync({
      station: 'radio-zet',
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });
    expect(outcome.kind).toBe('blocked');
  });

  test('returns disabled for an enabled=false station without any Spotify call', async () => {
    writeFileSync(stationsPath, JSON.stringify([{ ...ENABLED_STATION, enabled: false }]));
    let called = false;
    installFetch(async () => {
      called = true;
      return jsonResponse({});
    });
    const outcome = await runSync({
      station: 'radio-zet',
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });
    expect(outcome.kind).toBe('disabled');
    expect(called).toBe(false);
  });

  test('uses overrides to resolve a song that would otherwise miss', async () => {
    const s1 = seedSong('a|x', 'A', 'X');
    seedPlay(s1, '2026-05-24T01:00:00.000Z', '101');
    writeFileSync(
      overridesPath,
      JSON.stringify({
        overrides: [
          {
            match: { source: 'malopolskie-media', source_track_id: '101' },
            spotify_id: 'spotify:track:overrideoverrideoverri',
          },
        ],
      }),
    );

    installFetch(async (url, method) => {
      if (url.includes('/v1/me/playlists')) {
        return jsonResponse({
          items: [{ id: 'PID', name: 'Radio Zet Weekly Playlist' }],
          next: null,
        });
      }
      if (method === 'PUT') return jsonResponse({ snapshot_id: 'snap-cleared' });
      if (method === 'POST') return jsonResponse({ snapshot_id: 'snap-added' });
      return jsonResponse({}, 404);
    });

    const outcome = await runSync({
      station: 'radio-zet',
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });

    expect(outcome.kind).toBe('ok');
    const postCall = fetchCalls.find((c) => c.method === 'POST');
    const body = JSON.parse(postCall?.body ?? '{}');
    expect(body.uris).toContain('spotify:track:overrideoverrideoverri');
  });
});
