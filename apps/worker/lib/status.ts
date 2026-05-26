import {
  type Db,
  crawlRunsRepo,
  matchesRepo,
  openDb,
  syncRunsRepo,
  unmatchedRepo,
} from '@radiofy/database';
import { loadStations } from '@radiofy/shared';

const STALE_THRESHOLD_HOURS = 36;
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

export type StationHealth = 'ok' | 'stale' | 'no_data' | 'disabled';

export interface StationStatus {
  id: string;
  name: string;
  enabled: boolean;
  health: StationHealth;
  lastCrawlAt: string | null;
  lastSyncAt: string | null;
  openUnmatched: number;
}

export interface StatusReport {
  generatedAt: string;
  stations: StationStatus[];
  spotifyMatchesCacheSize: number;
  totalOpenUnmatched: number;
  stuckRunsCount: number;
}

export interface StatusOptions {
  db?: Db;
  stationsPath?: string;
  strict?: boolean;
  now?: () => Date;
  stdout?: (line: string) => void;
}

export interface StatusOutcome {
  exitCode: number;
  report: StatusReport;
}

const computeHealth = (
  enabled: boolean,
  lastCrawlAt: string | null,
  staleCutoffIso: string,
): StationHealth => {
  if (!enabled) return 'disabled';
  if (lastCrawlAt === null) return 'no_data';
  return lastCrawlAt < staleCutoffIso ? 'stale' : 'ok';
};

export const runStatus = (options: StatusOptions = {}): StatusOutcome => {
  const db = options.db ?? openDb();
  const now = options.now ?? ((): Date => new Date());
  const stdout =
    options.stdout ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });
  const stations = loadStations(options.stationsPath);

  const staleCutoff = new Date(now().getTime() - STALE_THRESHOLD_HOURS * 3600 * 1000).toISOString();
  const stuckCutoff = new Date(now().getTime() - STUCK_THRESHOLD_MS).toISOString();

  const stuckRunsCount =
    crawlRunsRepo.findStuckOlderThan(db, stuckCutoff).length +
    syncRunsRepo.findStuckOlderThan(db, stuckCutoff).length;
  const matchesCacheSize = matchesRepo.count(db);

  const stationStatuses: StationStatus[] = stations.map((s) => {
    const lastCrawl = crawlRunsRepo.lastSuccess(db, s.id);
    const lastSync = syncRunsRepo.lastSuccess(db, s.id);
    const lastCrawlAt = lastCrawl?.finishedAt ?? null;
    return {
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      health: computeHealth(s.enabled, lastCrawlAt, staleCutoff),
      lastCrawlAt,
      lastSyncAt: lastSync?.finishedAt ?? null,
      openUnmatched: unmatchedRepo.countOpen(db, s.id),
    };
  });

  const totalOpenUnmatched = stationStatuses.reduce((a, s) => a + s.openUnmatched, 0);

  const report: StatusReport = {
    generatedAt: now().toISOString(),
    stations: stationStatuses,
    spotifyMatchesCacheSize: matchesCacheSize,
    totalOpenUnmatched,
    stuckRunsCount,
  };

  let exitCode = 0;
  for (const s of stationStatuses) {
    if (s.health === 'stale') exitCode = 1;
    if (s.health === 'no_data' && options.strict === true) exitCode = 1;
  }
  if (stuckRunsCount > 0) exitCode = 1;

  stdout(
    'station            health    last_crawl                    last_sync                     open_unmatched',
  );
  stdout(
    '-----------------  --------  ----------------------------  ----------------------------  --------------',
  );
  for (const s of stationStatuses) {
    stdout(
      `${s.id.padEnd(17)}  ${s.health.padEnd(8)}  ${(s.lastCrawlAt ?? 'no data yet').padEnd(28)}  ${(s.lastSyncAt ?? 'no data yet').padEnd(28)}  ${String(s.openUnmatched)}`,
    );
  }
  stdout('');
  stdout(`spotify_matches cache: ${matchesCacheSize}`);
  stdout(`open unmatched total : ${totalOpenUnmatched}`);
  stdout(`stuck runs           : ${stuckRunsCount}`);

  return { exitCode, report };
};
