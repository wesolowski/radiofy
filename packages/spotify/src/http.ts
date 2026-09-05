import { logger } from '@radiofy/shared';
import { SpotifyAuthExpiredError, SpotifyTransientError } from './errors.ts';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;
/**
 * Bounds a request that is accepted and then never answered. Lower than the
 * scraped sources' deadline because Spotify's API is homogeneous and fast, and
 * because sync resolves one request per uncached song — four attempts each adds
 * up quickly when the API stops answering.
 */
const REQUEST_TIMEOUT_MS = 10_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number => {
  if (value === null) return 1;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
};

export interface SpotifyFetchOptions extends Omit<RequestInit, 'headers' | 'signal'> {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export type SpotifyJsonResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number };

const withRetries = async <T>(
  url: string,
  accessToken: string,
  options: SpotifyFetchOptions,
  read: (res: Response) => Promise<T>,
): Promise<T> => {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...init } = options;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let value: T;
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(timeoutMs),
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

      value = await read(res);
    } catch (err) {
      if (err instanceof SpotifyAuthExpiredError || err instanceof SpotifyTransientError) throw err;
      if (!(err instanceof Error && err.name === 'TimeoutError')) throw err;
      if (attempt === MAX_RETRIES) {
        throw new SpotifyTransientError(`Spotify did not answer within ${timeoutMs}ms: ${url}`);
      }
      const wait = 2 ** attempt * BACKOFF_BASE_MS;
      logger.warn('spotify: no answer, backing off', { url, timeoutMs, wait });
      await sleep(wait);
      continue;
    }

    return value;
  }

  throw new SpotifyTransientError('Spotify retries exhausted unexpectedly');
};

/**
 * Reads the response body inside the retried region. A response whose headers
 * arrive and whose body then stalls trips the same deadline as a silent server
 * and deserves the same retry and the same transient classification; a caller
 * reading `res.json()` afterwards would get a bare abort instead.
 */
export const spotifyFetchJson = async <T>(
  url: string,
  accessToken: string,
  options: SpotifyFetchOptions = {},
): Promise<SpotifyJsonResult<T>> =>
  withRetries(url, accessToken, options, async (res) =>
    res.ok
      ? { ok: true as const, status: res.status, body: (await res.json()) as T }
      : { ok: false as const, status: res.status },
  );

export const spotifyFetch = async (
  url: string,
  accessToken: string,
  options: SpotifyFetchOptions = {},
): Promise<Response> => withRetries(url, accessToken, options, async (res) => res);
