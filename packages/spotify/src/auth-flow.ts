import { loadConfig } from '@radiofy/shared';
import { generateChallenge, generateState, generateVerifier } from './pkce.ts';

export const SCOPES = ['playlist-modify-public', 'playlist-modify-private'] as const;

export const TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';

export interface AuthRequest {
  authUrl: string;
  state: string;
  verifier: string;
}

export const buildAuthRequest = (): AuthRequest => {
  const config = loadConfig();
  const state = generateState();
  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.SPOTIFY_CLIENT_ID);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('redirect_uri', config.SPOTIFY_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', challenge);
  return { authUrl: url.toString(), state, verifier };
};

export interface ExchangeInput {
  code: string;
  verifier: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

const basicAuthHeader = (clientId: string, clientSecret: string): string =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

export const exchangeCode = async ({ code, verifier }: ExchangeInput): Promise<TokenResponse> => {
  const config = loadConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.SPOTIFY_REDIRECT_URI,
    client_id: config.SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(config.SPOTIFY_CLIENT_ID, config.SPOTIFY_CLIENT_SECRET),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenResponse;
};
