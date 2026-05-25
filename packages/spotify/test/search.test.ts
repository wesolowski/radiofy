import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { NormalizedSong } from '@radiofy/shared';
import { searchTrack } from '../src/search.ts';

const song = (primaryArtist: string, title: string): NormalizedSong => ({
  normalizedKey: `${primaryArtist.toLowerCase()}|${title.toLowerCase()}`,
  primaryArtist,
  allArtists: primaryArtist,
  title,
  originalArtists: [primaryArtist],
  originalTitle: title,
});

let originalFetch: typeof globalThis.fetch;
let calls: { url: string; auth: string | null }[];

const installFetch = (responder: (url: string) => Response | Promise<Response>): void => {
  calls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const headers = new Headers(init?.headers ?? {});
    calls.push({ url: resolved, auth: headers.get('Authorization') });
    return responder(resolved);
  }) as typeof globalThis.fetch;
};

const trackBody = (items: Array<{ id: string; name: string; artists: string[] }>): string =>
  JSON.stringify({
    tracks: {
      items: items.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map((n) => ({ id: `a-${n}`, name: n })),
        duration_ms: 240_000,
      })),
    },
  });

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('searchTrack', () => {
  test('returns scored candidates sorted desc on a happy path', async () => {
    installFetch(
      async () =>
        new Response(
          trackBody([
            { id: 'top', name: '(I Just) Died In Your Arms', artists: ['Komodo'] },
            { id: 'live', name: '(I Just) Died In Your Arms - Live', artists: ['Komodo'] },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const result = await searchTrack(song('Komodo', '(I Just) Died In Your Arms'), 'token');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.spotifyTrackId).toBe('top');
    expect(result[0]?.score).toBeGreaterThanOrEqual(0.85);
    expect(calls[0]?.auth).toBe('Bearer token');
  });

  test('returns [] when Spotify returns no tracks (no diacritics → no fallback)', async () => {
    installFetch(
      async () =>
        new Response(JSON.stringify({ tracks: { items: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const result = await searchTrack(song('Pitbull', 'Made Up Title'), 'token');
    expect(result).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  test('retries with diacritic-preserving query when ASCII-folded query returns nothing', async () => {
    let call = 0;
    installFetch(async () => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 });
      }
      return new Response(trackBody([{ id: 'fallback', name: 'Miłości', artists: ['Hyży'] }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const result = await searchTrack(song('Hyży', 'Miłości'), 'token');
    expect(calls).toHaveLength(2);
    const firstQuery = decodeURIComponent(calls[0]?.url ?? '');
    const secondQuery = decodeURIComponent(calls[1]?.url ?? '');
    expect(firstQuery).toContain('Hyzy');
    expect(firstQuery).toContain('Milosci');
    expect(secondQuery).toContain('Hyży');
    expect(secondQuery).toContain('Miłości');
    expect(result[0]?.spotifyTrackId).toBe('fallback');
  });

  test('does not call the fallback when input has no diacritics', async () => {
    installFetch(
      async () => new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 }),
    );
    await searchTrack(song('Komodo', 'Died In Your Arms'), 'token');
    expect(calls).toHaveLength(1);
  });
});
