import { logger } from '@radiofy/shared';
import { SpotifyAuthExpiredError, SpotifyTransientError } from './errors.ts';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number => {
  if (value === null) return 1;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
};

export interface SpotifyFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

export const spotifyFetch = async (
  url: string,
  accessToken: string,
  options: SpotifyFetchOptions = {},
): Promise<Response> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401) {
      throw new SpotifyAuthExpiredError(
        'Spotify rejected the access token — refresh and retry, or re-run `bun run spotify:auth`.',
      );
    }

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) {
        throw new SpotifyTransientError(`Spotify 429 after ${MAX_RETRIES} retries`, 429);
      }
      const wait = parseRetryAfter(res.headers.get('Retry-After')) * 1000;
      logger.warn('spotify: rate limited, sleeping', { url, wait });
      await sleep(wait);
      continue;
    }

    if (res.status >= 500 && res.status < 600) {
      if (attempt === MAX_RETRIES) {
        throw new SpotifyTransientError(
          `Spotify ${res.status} after ${MAX_RETRIES} retries`,
          res.status,
        );
      }
      const wait = 2 ** attempt * BACKOFF_BASE_MS;
      logger.warn('spotify: server error, backing off', { url, status: res.status, wait });
      await sleep(wait);
      continue;
    }

    return res;
  }

  throw new SpotifyTransientError('Spotify retries exhausted unexpectedly');
};
