import { loadConfig } from '@radiofy/shared';
import { readAuth } from './auth-storage.ts';
import { SpotifyAuthExpiredError } from './errors.ts';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REFRESH_SAFETY_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: CachedToken | null = null;
let refreshInFlight: Promise<string> | null = null;

const basicAuth = (clientId: string, clientSecret: string): string =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

const performRefresh = async (authFilePath?: string): Promise<string> => {
  const config = loadConfig();
  const stored = readAuth(authFilePath);
  if (stored === null) {
    throw new SpotifyAuthExpiredError(
      'No Spotify auth file found at storage/auth/spotify.json — run `bun run spotify:auth` first.',
    );
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: stored.refresh_token,
    client_id: config.SPOTIFY_CLIENT_ID,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(config.SPOTIFY_CLIENT_ID, config.SPOTIFY_CLIENT_SECRET),
    },
    body,
  });
  if (res.status === 400 || res.status === 401) {
    throw new SpotifyAuthExpiredError();
  }
  if (!res.ok) {
    throw new Error(`Spotify token endpoint returned ${res.status}`);
  }
  const json = (await res.json()) as RefreshResponse;
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - REFRESH_SAFETY_MS,
  };
  return cachedToken.accessToken;
};

export const getAccessToken = async (authFilePath?: string): Promise<string> => {
  if (cachedToken !== null && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  if (refreshInFlight !== null) {
    return refreshInFlight;
  }
  refreshInFlight = performRefresh(authFilePath).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

export const resetAuthCache = (): void => {
  cachedToken = null;
  refreshInFlight = null;
};
