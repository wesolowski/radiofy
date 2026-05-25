import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { SpotifyAuthExpiredError, SpotifyTransientError } from '../src/errors.ts';
import { spotifyFetch } from '../src/http.ts';

let originalFetch: typeof globalThis.fetch;
let calls: { url: string }[];

type Responder = () => Response | Promise<Response>;

const installFetchSequence = (responders: Responder[]): void => {
  calls = [];
  let i = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const resolved = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push({ url: resolved });
    const next = responders[i] ?? responders[responders.length - 1];
    i++;
    return next?.();
  }) as typeof globalThis.fetch;
};

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const okJson =
  (body: unknown): Responder =>
  () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

const status =
  (code: number, headers: Record<string, string> = {}): Responder =>
  () =>
    new Response('', { status: code, headers });

describe('spotifyFetch retry behaviour', () => {
  test('passes through a 200 response', async () => {
    installFetchSequence([okJson({ ok: true })]);
    const res = await spotifyFetch('https://api.spotify.com/v1/test', 'token');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  test('respects Retry-After on 429 and retries once', async () => {
    installFetchSequence([status(429, { 'Retry-After': '0' }), okJson({ ok: true })]);
    const res = await spotifyFetch('https://api.spotify.com/v1/test', 'token');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  test('5xx triggers exponential backoff up to MAX_RETRIES retries, then SpotifyTransientError', async () => {
    installFetchSequence([status(500), status(502), status(503), status(504)]);
    await expect(spotifyFetch('https://api.spotify.com/v1/test', 'token')).rejects.toBeInstanceOf(
      SpotifyTransientError,
    );
    expect(calls).toHaveLength(4);
  });

  test('5xx then 200 recovers', async () => {
    installFetchSequence([status(500), okJson({ ok: true })]);
    const res = await spotifyFetch('https://api.spotify.com/v1/test', 'token');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  test('401 throws SpotifyAuthExpiredError immediately (no retry)', async () => {
    installFetchSequence([status(401), status(401)]);
    await expect(spotifyFetch('https://api.spotify.com/v1/test', 'token')).rejects.toBeInstanceOf(
      SpotifyAuthExpiredError,
    );
    expect(calls).toHaveLength(1);
  });

  test('Retry-After of 2 sleeps for at least ~2000ms', async () => {
    installFetchSequence([status(429, { 'Retry-After': '2' }), okJson({ ok: true })]);
    const start = Date.now();
    await spotifyFetch('https://api.spotify.com/v1/test', 'token');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(1800);
  });
});
