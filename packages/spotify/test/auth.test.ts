import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuth } from '../src/auth-storage.ts';
import { getAccessToken, resetAuthCache } from '../src/auth.ts';
import { SpotifyAuthExpiredError } from '../src/errors.ts';

const baseEnv: Record<string, string> = {
  SPOTIFY_CLIENT_ID: 'test-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-client-secret',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:8888/callback',
  LOG_LEVEL: 'info',
};

let dir: string;
let authPath: string;
let originalFetch: typeof globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit | undefined }[];

const installFetch = (responder: (url: string) => Response | Promise<Response>): void => {
  fetchCalls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolvedUrl = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    fetchCalls.push({ url: resolvedUrl, init });
    return responder(resolvedUrl);
  }) as typeof globalThis.fetch;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-auth-test-'));
  authPath = join(dir, 'spotify.json');
  for (const [k, v] of Object.entries(baseEnv)) process.env[k] = v;
  originalFetch = globalThis.fetch;
  resetAuthCache();
  writeAuth(
    {
      refresh_token: 'rt-1',
      scopes: ['playlist-modify-public', 'playlist-modify-private'],
      obtained_at: '2026-05-25T00:00:00.000Z',
      client_id_hint: 't-id',
    },
    authPath,
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  globalThis.fetch = originalFetch;
  resetAuthCache();
  for (const k of Object.keys(baseEnv)) delete process.env[k];
});

describe('getAccessToken', () => {
  test('refreshes once and caches the access token within the process', async () => {
    installFetch(
      async () =>
        new Response(JSON.stringify({ access_token: 'AT-1', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const first = await getAccessToken(authPath);
    const second = await getAccessToken(authPath);
    expect(first).toBe('AT-1');
    expect(second).toBe('AT-1');
    expect(fetchCalls).toHaveLength(1);
  });

  test('issues only one in-flight refresh when called concurrently', async () => {
    let resolved = 0;
    installFetch(async () => {
      resolved++;
      return new Response(JSON.stringify({ access_token: `AT-${resolved}`, expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const [a, b, c] = await Promise.all([
      getAccessToken(authPath),
      getAccessToken(authPath),
      getAccessToken(authPath),
    ]);
    expect(a).toBe('AT-1');
    expect(b).toBe('AT-1');
    expect(c).toBe('AT-1');
    expect(fetchCalls).toHaveLength(1);
  });

  test('throws SpotifyAuthExpiredError on 401 from token endpoint', async () => {
    installFetch(async () => new Response('invalid_grant', { status: 401 }));
    await expect(getAccessToken(authPath)).rejects.toBeInstanceOf(SpotifyAuthExpiredError);
  });

  test('throws SpotifyAuthExpiredError on 400 (revoked refresh token)', async () => {
    installFetch(async () => new Response('invalid_grant', { status: 400 }));
    await expect(getAccessToken(authPath)).rejects.toBeInstanceOf(SpotifyAuthExpiredError);
  });

  test('throws SpotifyAuthExpiredError when the auth file is missing', async () => {
    rmSync(authPath);
    installFetch(async () => new Response('should not be called', { status: 500 }));
    await expect(getAccessToken(authPath)).rejects.toBeInstanceOf(SpotifyAuthExpiredError);
    expect(fetchCalls).toHaveLength(0);
  });

  test('refreshes again after resetAuthCache (simulates a new process)', async () => {
    installFetch(
      async () =>
        new Response(JSON.stringify({ access_token: 'AT-x', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await getAccessToken(authPath);
    resetAuthCache();
    await getAccessToken(authPath);
    expect(fetchCalls).toHaveLength(2);
  });
});
