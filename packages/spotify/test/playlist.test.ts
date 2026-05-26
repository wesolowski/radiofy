import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  PLAYLIST_WRITE_BATCH,
  PlaylistEmptyError,
  PlaylistNotFoundError,
  getPlaylistByName,
  getPlaylistTracks,
  replacePlaylistTracks,
} from '../src/playlist.ts';

let originalFetch: typeof globalThis.fetch;
let calls: { url: string; method: string; body: string | null }[];

const installFetch = (
  responder: (url: string, method: string) => Response | Promise<Response>,
): void => {
  calls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolvedUrl = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const method = init?.method ?? 'GET';
    const body = init?.body === undefined ? null : String(init.body);
    calls.push({ url: resolvedUrl, method, body });
    return responder(resolvedUrl, method);
  }) as typeof globalThis.fetch;
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('getPlaylistByName', () => {
  test('returns the id of the matching playlist on page 1', async () => {
    installFetch(async () =>
      jsonResponse({
        items: [
          { id: 'p1', name: 'Other' },
          { id: 'p2', name: 'Radio Zet Weekly Playlist' },
        ],
        next: null,
      }),
    );
    const result = await getPlaylistByName('Radio Zet Weekly Playlist', 'token');
    expect(result.id).toBe('p2');
    expect(calls).toHaveLength(1);
  });

  test('paginates and stops at the matching page', async () => {
    let page = 0;
    installFetch(async () => {
      page++;
      if (page === 1) {
        return jsonResponse({
          items: [{ id: 'a', name: 'First' }],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50',
        });
      }
      if (page === 2) {
        return jsonResponse({
          items: [{ id: 'b', name: 'Second' }],
          next: 'https://api.spotify.com/v1/me/playlists?offset=100&limit=50',
        });
      }
      return jsonResponse({
        items: [{ id: 'target', name: 'Target' }],
        next: null,
      });
    });
    const result = await getPlaylistByName('Target', 'token');
    expect(result.id).toBe('target');
    expect(calls).toHaveLength(3);
  });

  test('throws PlaylistNotFoundError when no playlist matches', async () => {
    installFetch(async () => jsonResponse({ items: [{ id: 'a', name: 'Other' }], next: null }));
    await expect(getPlaylistByName('Missing', 'token')).rejects.toBeInstanceOf(
      PlaylistNotFoundError,
    );
  });

  test('returns the first match and logs a warning when multiple match', async () => {
    installFetch(async () =>
      jsonResponse({
        items: [
          { id: 'dup1', name: 'Same Name' },
          { id: 'dup2', name: 'Same Name' },
        ],
        next: null,
      }),
    );
    const result = await getPlaylistByName('Same Name', 'token');
    expect(result.id).toBe('dup1');
  });
});

describe('getPlaylistTracks', () => {
  test('paginates through all pages and preserves order', async () => {
    let page = 0;
    installFetch(async () => {
      page++;
      if (page === 1) {
        return jsonResponse({
          items: [
            {
              added_at: '2026-05-24T00:00:00Z',
              track: { id: 't1', name: 'A', artists: [{ id: 'a1', name: 'Komodo' }] },
            },
          ],
          next: 'https://api.spotify.com/v1/playlists/PID/tracks?offset=100&limit=100',
        });
      }
      return jsonResponse({
        items: [
          {
            added_at: '2026-05-25T00:00:00Z',
            track: { id: 't2', name: 'B', artists: [{ id: 'a2', name: 'IRA' }] },
          },
        ],
        next: null,
      });
    });
    const tracks = await getPlaylistTracks('PID', 'token');
    expect(tracks.map((t) => t.spotifyTrackId)).toEqual(['t1', 't2']);
    expect(tracks[0]?.primaryArtist).toBe('Komodo');
  });

  test('skips local files and null tracks without throwing', async () => {
    installFetch(async () =>
      jsonResponse({
        items: [
          { track: null },
          { track: { id: null, name: 'Local', is_local: true, artists: [] } },
          { track: { id: 'real', name: 'Real', artists: [{ id: 'a', name: 'Artist' }] } },
        ],
        next: null,
      }),
    );
    const tracks = await getPlaylistTracks('PID', 'token');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.spotifyTrackId).toBe('real');
  });

  test('returns [] for an empty playlist', async () => {
    installFetch(async () => jsonResponse({ items: [], next: null }));
    const tracks = await getPlaylistTracks('PID', 'token');
    expect(tracks).toEqual([]);
  });

  test('throws PlaylistNotFoundError on 404', async () => {
    installFetch(async () => new Response('not found', { status: 404 }));
    await expect(getPlaylistTracks('nope', 'token')).rejects.toBeInstanceOf(PlaylistNotFoundError);
  });
});

describe('replacePlaylistTracks', () => {
  test('clears the playlist with PUT [] then appends the URIs in one POST when count <= batch', async () => {
    let n = 0;
    installFetch(async () => {
      n++;
      return jsonResponse({ snapshot_id: `snap-${n}` });
    });
    const result = await replacePlaylistTracks('PID', ['t1', 't2', 't3'], 'token');
    expect(result.snapshotId).toBe('snap-2');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe('PUT');
    expect(JSON.parse(calls[0]?.body ?? '{}').uris).toEqual([]);
    expect(calls[1]?.method).toBe('POST');
    expect(JSON.parse(calls[1]?.body ?? '{}').uris).toEqual([
      'spotify:track:t1',
      'spotify:track:t2',
      'spotify:track:t3',
    ]);
  });

  test('chunks 250 URIs into one PUT + three POSTs of 100/100/50 in order', async () => {
    let n = 0;
    installFetch(async () => {
      n++;
      return jsonResponse({ snapshot_id: `snap-${n}` });
    });
    const ids = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const result = await replacePlaylistTracks('PID', ids, 'token');
    expect(calls).toHaveLength(4);
    expect(calls[0]?.method).toBe('PUT');
    expect(JSON.parse(calls[0]?.body ?? '{}').uris).toEqual([]);
    expect(calls[1]?.method).toBe('POST');
    expect(JSON.parse(calls[1]?.body ?? '{}').uris).toHaveLength(100);
    expect(calls[2]?.method).toBe('POST');
    expect(JSON.parse(calls[2]?.body ?? '{}').uris).toHaveLength(100);
    expect(calls[3]?.method).toBe('POST');
    expect(JSON.parse(calls[3]?.body ?? '{}').uris).toHaveLength(50);
    const last = JSON.parse(calls[3]?.body ?? '{}').uris as string[];
    expect(last[0]).toBe('spotify:track:t200');
    expect(last[49]).toBe('spotify:track:t249');
    expect(result.snapshotId).toBe('snap-4');
  });

  test('PLAYLIST_WRITE_BATCH matches the documented Spotify limit', () => {
    expect(PLAYLIST_WRITE_BATCH).toBe(100);
  });

  test('accepts pre-formatted spotify:track: URIs', async () => {
    installFetch(async () => jsonResponse({ snapshot_id: 'snap' }));
    await replacePlaylistTracks('PID', ['spotify:track:t1', 'spotify:track:t2'], 'token');
    expect(JSON.parse(calls[1]?.body ?? '{}').uris).toEqual([
      'spotify:track:t1',
      'spotify:track:t2',
    ]);
  });

  test('throws PlaylistEmptyError without any HTTP call on []', async () => {
    let called = false;
    installFetch(async () => {
      called = true;
      return jsonResponse({});
    });
    await expect(replacePlaylistTracks('PID', [], 'token')).rejects.toBeInstanceOf(
      PlaylistEmptyError,
    );
    expect(called).toBe(false);
  });

  test('throws PlaylistNotFoundError on 404 during clear', async () => {
    installFetch(async () => new Response('not found', { status: 404 }));
    await expect(replacePlaylistTracks('nope', ['t1'], 'token')).rejects.toBeInstanceOf(
      PlaylistNotFoundError,
    );
  });

  test('throws PlaylistNotFoundError on 404 during append', async () => {
    let n = 0;
    installFetch(async () => {
      n++;
      if (n === 1) return jsonResponse({ snapshot_id: 'cleared' });
      return new Response('not found', { status: 404 });
    });
    await expect(replacePlaylistTracks('PID', ['t1'], 'token')).rejects.toBeInstanceOf(
      PlaylistNotFoundError,
    );
  });
});
