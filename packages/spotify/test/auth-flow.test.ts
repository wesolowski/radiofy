import { describe, expect, test } from 'bun:test';
import { SCOPES, buildAuthRequest } from '../src/auth-flow.ts';

const baseEnv = {
  SPOTIFY_CLIENT_ID: 'test-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-client-secret',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:8888/callback',
  LOG_LEVEL: 'info',
};

const withEnv = <T>(env: Record<string, string>, fn: () => T): T => {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    for (const [k, v] of Object.entries(prev)) {
      if (v !== undefined) process.env[k] = v;
    }
  }
};

describe('buildAuthRequest', () => {
  test('builds a Spotify authorize URL with the required PKCE + state fields', () => {
    const { authUrl, state, verifier } = withEnv(baseEnv, () => buildAuthRequest());
    const url = new URL(authUrl);
    expect(url.origin).toBe('https://accounts.spotify.com');
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8888/callback');
    expect(url.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')?.length).toBeGreaterThan(0);
    expect(url.searchParams.get('state')).toBe(state);
    expect((url.searchParams.get('state') ?? '').length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  test('generates a fresh state + verifier on each call', () => {
    const a = withEnv(baseEnv, () => buildAuthRequest());
    const b = withEnv(baseEnv, () => buildAuthRequest());
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });
});
