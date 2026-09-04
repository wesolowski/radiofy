import { type Db, openDb } from '@radiofy/database';
import { logger } from '@radiofy/shared';
import { type CrawlOptions, runCrawl } from './crawl.ts';
import { loadEnabledStationIds } from './station-loader.ts';
import { type SyncOptions, runSync } from './sync.ts';

export interface WeeklyOptions {
  db?: Db;
  stationsPath?: string;
  overridesPath?: string;
  accessToken?: string;
  now?: () => Date;
}

export interface WeeklyOutcome {
  stations: number;
  failed: boolean;
  blocked: boolean;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Runs the full weekly refresh: ingest every enabled station, then replace
 * every enabled station's playlist. The sync phase runs regardless of the
 * crawl phase's result so a partial upstream outage still yields an
 * up-to-date playlist from the days that did arrive.
 */
export const runWeekly = async (options: WeeklyOptions = {}): Promise<WeeklyOutcome> => {
  const db = options.db ?? openDb();
  const stations = loadEnabledStationIds(options.stationsPath);
  let failed = false;
  let blocked = false;

  const crawlOptionsFor = (station: string): CrawlOptions => {
    const opts: CrawlOptions = { station, db };
    if (options.stationsPath !== undefined) opts.stationsPath = options.stationsPath;
    if (options.now !== undefined) opts.now = options.now;
    return opts;
  };

  const syncOptionsFor = (station: string): SyncOptions => {
    const opts: SyncOptions = { station, db };
    if (options.stationsPath !== undefined) opts.stationsPath = options.stationsPath;
    if (options.overridesPath !== undefined) opts.overridesPath = options.overridesPath;
    if (options.accessToken !== undefined) opts.accessToken = options.accessToken;
    if (options.now !== undefined) opts.now = options.now;
    return opts;
  };

  logger.info('weekly: crawl phase', { stations: stations.length });
  for (const station of stations) {
    try {
      const outcome = await runCrawl(crawlOptionsFor(station));
      if (outcome.kind === 'not_found') failed = true;
      if (outcome.kind === 'blocked') blocked = true;
      if (outcome.kind === 'ok' && outcome.daysFailed > 0) failed = true;
    } catch (err) {
      logger.error('weekly: crawl failed', { station, error: errorMessage(err) });
      failed = true;
    }
  }

  logger.info('weekly: sync phase', { stations: stations.length });
  for (const station of stations) {
    try {
      const outcome = await runSync(syncOptionsFor(station));
      if (outcome.kind === 'not_found') failed = true;
      if (outcome.kind === 'blocked') blocked = true;
      if (outcome.kind === 'playlist_not_found') failed = true;
    } catch (err) {
      logger.error('weekly: sync failed', { station, error: errorMessage(err) });
      failed = true;
    }
  }

  logger.info('weekly: done', { stations: stations.length, failed, blocked });
  return { stations: stations.length, failed, blocked };
};
