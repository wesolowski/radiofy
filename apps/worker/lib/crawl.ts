import {
  type Db,
  applyMigrations,
  crawlRunsRepo,
  openDb,
  playsRepo,
  songsRepo,
} from '@radiofy/database';
import { normalize } from '@radiofy/normalizer';
import { type RawSong, logger } from '@radiofy/shared';
import { type ParseInput, malopolskieMediaSource, odsluchaneEuSource } from '@radiofy/sources';
import { loadStation } from './station-loader.ts';
import { yesterdayInTz } from './yesterday.ts';

const OVERLAP_CUTOFF_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 7;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 500;
/**
 * Comfortably above the ~0.4s a healthy response takes, and comfortably below
 * the 60s the aggregator's gateway spends before giving up — so an unanswered
 * request costs seconds rather than a minute, three times over.
 */
const REQUEST_TIMEOUT_MS = 20_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeout = (err: unknown): boolean => err instanceof Error && err.name === 'TimeoutError';

const fetchWithRetry = async (
  url: string,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ status: number; ok: boolean; text: string }> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const wait = 2 ** attempt * BACKOFF_BASE_MS;
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 500 && res.status < 600 && attempt < MAX_RETRIES) {
        logger.warn('crawl: server error, backing off', { url, status: res.status, wait });
        await sleep(wait);
        continue;
      }
      return { status: res.status, ok: res.ok, text: res.ok ? await res.text() : '' };
    } catch (err) {
      const reason = isTimeout(err)
        ? new Error(`no answer within ${timeoutMs}ms from ${url}`)
        : err;
      if (attempt === MAX_RETRIES) throw reason;
      logger.warn('crawl: fetch error, backing off', {
        url,
        wait,
        error: reason instanceof Error ? reason.message : String(reason),
      });
      await sleep(wait);
    }
  }
  throw new Error(`crawl: retries exhausted for ${url}`);
};

interface SourceModule {
  dayUrls: (slug: string, day: string) => string[];
  parse: (input: ParseInput) => RawSong[];
}

const SOURCES: Record<string, SourceModule> = {
  'malopolskie-media': malopolskieMediaSource,
  'odsluchane-eu': odsluchaneEuSource,
};

const isSourceId = (s: string): boolean => s in SOURCES;

export interface CrawlOptions {
  station: string;
  day?: string;
  days?: number;
  db?: Db;
  fetchFn?: typeof globalThis.fetch;
  stationsPath?: string;
  timeoutMs?: number;
  now?: () => Date;
}

export type CrawlOutcome =
  | { kind: 'ok'; daysCrawled: number; daysFailed: number; songsSeen: number; inserted: number }
  | { kind: 'disabled' }
  | { kind: 'not_found' }
  | { kind: 'blocked' };

const shiftIso = (day: string, offsetDays: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`crawl: invalid day '${day}', expected YYYY-MM-DD`);
  }
  const utc = Date.UTC(y, m - 1, d) + offsetDays * DAY_MS;
  const back = new Date(utc);
  const yy = back.getUTCFullYear();
  const mm = String(back.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(back.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const resolveDays = (options: CrawlOptions, nowDate: Date): string[] => {
  if (options.day !== undefined) return [options.day];
  const yesterday = yesterdayInTz(nowDate);
  const count = options.days ?? DEFAULT_DAYS;
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    days.push(shiftIso(yesterday, -i));
  }
  return days.reverse();
};

const crawlOneDay = async (
  db: Db,
  source: SourceModule,
  station: { id: string; source: string; sourceSlug: string },
  day: string,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  now: () => Date,
): Promise<{ songsSeen: number; inserted: number }> => {
  const run = crawlRunsRepo.open(db, {
    station: station.id,
    day,
    startedAt: now().toISOString(),
  });

  try {
    const urls = source.dayUrls(station.sourceSlug, day);
    logger.info('crawl: fetching', { station: station.id, day, urls: urls.length });
    const songs: RawSong[] = [];
    for (const url of urls) {
      const res = await fetchWithRetry(url, fetchFn, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      songs.push(...source.parse({ html: res.text, station: station.id, day }));
    }
    logger.info('crawl: parsed', { station: station.id, day, songs: songs.length });

    const crawledAt = now().toISOString();
    let inserted = 0;
    for (const raw of songs) {
      try {
        const normalized = normalize(raw);
        const song = songsRepo.upsertByNormalizedKey(db, {
          normalizedKey: normalized.normalizedKey,
          primaryArtist: normalized.primaryArtist,
          allArtists: normalized.allArtists,
          title: normalized.title,
        });
        try {
          playsRepo.insert(db, {
            source: station.source,
            sourceTrackId: raw.sourceTrackId,
            station: station.id,
            songId: song.id,
            playedAt: raw.playedAt,
            crawledAt,
          });
          inserted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/UNIQUE/i.test(msg)) {
            logger.warn('crawl: play insert failed', { error: msg });
          }
        }
      } catch (err) {
        logger.warn('crawl: row failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    crawlRunsRepo.close(db, run.id, now().toISOString(), inserted, null);
    logger.info('crawl: done', { station: station.id, day, songsSeen: songs.length, inserted });
    return { songsSeen: songs.length, inserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    crawlRunsRepo.close(db, run.id, now().toISOString(), null, msg);
    throw err;
  }
};

export const runCrawl = async (options: CrawlOptions): Promise<CrawlOutcome> => {
  logger.bindRunFile(`storage/logs/crawl-${options.station}.log`);
  const db = options.db ?? openDb();
  applyMigrations(db);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const now = options.now ?? ((): Date => new Date());

  const stationResult = loadStation(options.station, options.stationsPath);
  if (stationResult.kind === 'not_found') {
    logger.error(`station '${options.station}' not found in config/stations.json`);
    return { kind: 'not_found' };
  }
  if (stationResult.kind === 'disabled') {
    return { kind: 'disabled' };
  }
  const station = stationResult.station;

  if (!isSourceId(station.source)) {
    throw new Error(`unknown source '${station.source}' for station '${station.id}'`);
  }
  const source = SOURCES[station.source];
  if (source === undefined) {
    throw new Error(`unknown source '${station.source}' for station '${station.id}'`);
  }

  const cutoff = new Date(now().getTime() - OVERLAP_CUTOFF_MS).toISOString();
  const openRuns = crawlRunsRepo.findOpen(db, station.id);
  for (const r of openRuns) {
    if (r.startedAt >= cutoff) {
      logger.error('crawl: another crawl is in progress for this station', {
        runId: r.id,
        startedAt: r.startedAt,
      });
      return { kind: 'blocked' };
    }
    logger.warn('crawl: overriding crashed run', { runId: r.id });
    crawlRunsRepo.close(db, r.id, now().toISOString(), null, 'crashed (no heartbeat)');
  }

  const days = resolveDays(options, now());
  let totalSongs = 0;
  let totalInserted = 0;
  let daysFailed = 0;

  for (const day of days) {
    try {
      const result = await crawlOneDay(
        db,
        source,
        { id: station.id, source: station.source, sourceSlug: station.sourceSlug },
        day,
        fetchFn,
        timeoutMs,
        now,
      );
      totalSongs += result.songsSeen;
      totalInserted += result.inserted;
    } catch (err) {
      daysFailed++;
      logger.error('crawl: day failed', {
        station: station.id,
        day,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    kind: 'ok',
    daysCrawled: days.length,
    daysFailed,
    songsSeen: totalSongs,
    inserted: totalInserted,
  };
};
