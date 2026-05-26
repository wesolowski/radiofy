import {
  type Db,
  applyMigrations,
  crawlRunsRepo,
  openDb,
  playsRepo,
  songsRepo,
} from '@radiofy/database';
import { normalize } from '@radiofy/normalizer';
import { logger } from '@radiofy/shared';
import { malopolskieMediaSource, odsluchaneEuSource } from '@radiofy/sources';
import { loadStation } from './station-loader.ts';
import { yesterdayInTz } from './yesterday.ts';

const OVERLAP_CUTOFF_MS = 5 * 60 * 1000;

const SOURCES = {
  'malopolskie-media': malopolskieMediaSource,
  'odsluchane-eu': odsluchaneEuSource,
} as const;

type SourceId = keyof typeof SOURCES;

const isSourceId = (s: string): s is SourceId => s in SOURCES;

export interface CrawlOptions {
  station: string;
  day?: string;
  db?: Db;
  fetchFn?: typeof globalThis.fetch;
  stationsPath?: string;
  now?: () => Date;
}

export type CrawlOutcome =
  | { kind: 'ok'; songsSeen: number; inserted: number }
  | { kind: 'disabled' }
  | { kind: 'not_found' }
  | { kind: 'blocked' };

export const runCrawl = async (options: CrawlOptions): Promise<CrawlOutcome> => {
  logger.bindRunFile(`storage/logs/crawl-${options.station}.log`);
  const db = options.db ?? openDb();
  applyMigrations(db);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
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
  const day = options.day ?? yesterdayInTz(now());

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

  const run = crawlRunsRepo.open(db, {
    station: station.id,
    day,
    startedAt: now().toISOString(),
  });

  try {
    const urls = source.dayUrls(station.sourceSlug, day);
    logger.info('crawl: fetching', { station: station.id, day, urls: urls.length });
    const songs = [];
    for (const url of urls) {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const html = await res.text();
      songs.push(...source.parse({ html, station: station.id, day }));
    }
    logger.info('crawl: parsed', { station: station.id, songs: songs.length });

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
    logger.info('crawl: done', { station: station.id, songsSeen: songs.length, inserted });
    return { kind: 'ok', songsSeen: songs.length, inserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    crawlRunsRepo.close(db, run.id, now().toISOString(), null, msg);
    throw err;
  }
};
