import { type Db, applyMigrations, openDb, syncRunsRepo } from '@radiofy/database';
import { type OverrideTable, loadOverrides, resolveSong } from '@radiofy/matcher';
import { normalize } from '@radiofy/normalizer';
import { type Chart, type RawSong, loadCharts, logger } from '@radiofy/shared';
import { type ChartEntry, ESKA_GORACA20_ID, eskaGoraca20Source } from '@radiofy/sources';
import {
  PlaylistNotFoundError,
  getAccessToken,
  getPlaylistByName,
  replacePlaylistTracks,
} from '@radiofy/spotify';

const OVERLAP_CUTOFF_MS = 5 * 60 * 1000;
const OVERRIDES_PATH = 'storage/overrides.json';

export interface ChartOptions {
  chart: string;
  db?: Db;
  chartsPath?: string;
  overridesPath?: string;
  accessToken?: string;
  now?: () => Date;
}

export type ChartOutcome =
  | { kind: 'ok'; entriesParsed: number; tracksWritten: number; snapshotId: string }
  | { kind: 'implausible'; entriesParsed: number; minEntries: number }
  | { kind: 'degraded'; entriesParsed: number; apiErrors: number }
  | { kind: 'no_songs'; entriesParsed: number }
  | { kind: 'playlist_not_found'; name: string }
  | { kind: 'disabled' }
  | { kind: 'not_found' }
  | { kind: 'blocked' };

const PARSERS: Record<string, (input: { html: string }) => ChartEntry[]> = {
  [ESKA_GORACA20_ID]: eskaGoraca20Source.parseChart,
};

const asRawSong = (entry: ChartEntry, seenAt: string): RawSong => ({
  sourceTrackId: entry.sourceTrackId,
  displayText: entry.displayText,
  artists: entry.artists,
  title: entry.title,
  playedAt: seenAt,
});

const loadChart = (id: string, chartsPath?: string): Chart | 'not_found' | 'disabled' => {
  const found = loadCharts(chartsPath).find((c) => c.id === id);
  if (found === undefined) return 'not_found';
  if (!found.enabled) return 'disabled';
  return found;
};

/**
 * Replaces one playlist with a chart page's entries in the page's own order:
 * ranked chart first, then the unranked proposals. The playlist is only ever
 * written by a run that parsed a plausible number of entries and resolved at
 * least one of them, and whose Spotify lookups all completed — neither a page
 * redesign nor a degraded search API may shrink it.
 */
export const runChart = async (options: ChartOptions): Promise<ChartOutcome> => {
  logger.bindRunFile(`storage/logs/chart-${options.chart}.log`);
  const db = options.db ?? openDb();
  applyMigrations(db);
  const now = options.now ?? ((): Date => new Date());

  const loaded = loadChart(options.chart, options.chartsPath);
  if (loaded === 'not_found') {
    logger.error(`chart '${options.chart}' not found in config/charts.json`);
    return { kind: 'not_found' };
  }
  if (loaded === 'disabled') {
    logger.info(`chart ${options.chart} is disabled, skipping`);
    return { kind: 'disabled' };
  }
  const chart = loaded;

  const parser = PARSERS[chart.source];
  if (parser === undefined) {
    throw new Error(`unknown chart source '${chart.source}' for chart '${chart.id}'`);
  }

  const cutoff = new Date(now().getTime() - OVERLAP_CUTOFF_MS).toISOString();
  for (const r of syncRunsRepo.findOpen(db, chart.id)) {
    if (r.startedAt >= cutoff) {
      logger.error('chart: another run is in progress for this chart', {
        runId: r.id,
        startedAt: r.startedAt,
      });
      return { kind: 'blocked' };
    }
    logger.warn('chart: overriding crashed run', { runId: r.id });
    syncRunsRepo.close(db, r.id, now().toISOString(), null, 'crashed (no heartbeat)');
  }

  const run = syncRunsRepo.open(db, { station: chart.id, startedAt: now().toISOString() });

  try {
    const overrides: OverrideTable = loadOverrides(options.overridesPath ?? OVERRIDES_PATH);
    const accessToken = options.accessToken ?? (await getAccessToken());

    logger.info('chart: fetching', { chart: chart.id, url: chart.url });
    const res = await fetch(chart.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${chart.url}`);
    const entries = parser({ html: await res.text() });
    logger.info('chart: parsed', { chart: chart.id, entries: entries.length });

    if (entries.length < chart.minEntries) {
      const msg = `parsed ${entries.length} entries, expected at least ${chart.minEntries} — leaving the playlist untouched`;
      logger.error('chart: implausible parse', { chart: chart.id, entries: entries.length });
      syncRunsRepo.close(db, run.id, now().toISOString(), null, msg);
      return { kind: 'implausible', entriesParsed: entries.length, minEntries: chart.minEntries };
    }

    const seenAt = now().toISOString();
    const uris: string[] = [];
    const seen = new Set<string>();
    let apiErrors = 0;
    for (const entry of entries) {
      const rawSong = asRawSong(entry, seenAt);
      const outcome = await resolveSong({
        db,
        overrides,
        accessToken,
        source: chart.source,
        station: chart.id,
        rawSong,
        normalized: normalize(rawSong),
      });
      if (outcome.kind === 'api_error') apiErrors++;
      if (outcome.kind !== 'override' && outcome.kind !== 'cache' && outcome.kind !== 'auto') {
        continue;
      }
      if (seen.has(outcome.spotifyTrackId)) continue;
      seen.add(outcome.spotifyTrackId);
      uris.push(outcome.spotifyTrackId);
    }

    if (apiErrors > 0) {
      const msg = `${apiErrors} of ${entries.length} lookups failed against Spotify — leaving the playlist untouched`;
      logger.error('chart: degraded lookups', { chart: chart.id, apiErrors });
      syncRunsRepo.close(db, run.id, now().toISOString(), null, msg);
      return { kind: 'degraded', entriesParsed: entries.length, apiErrors };
    }

    if (uris.length === 0) {
      const msg = 'no entry resolved to a Spotify track — leaving the playlist untouched';
      logger.warn('chart: nothing resolved — skipping playlist replace', { chart: chart.id });
      syncRunsRepo.close(db, run.id, now().toISOString(), null, msg);
      return { kind: 'no_songs', entriesParsed: entries.length };
    }

    let playlistId: string;
    try {
      playlistId = (await getPlaylistByName(chart.playlistName, accessToken)).id;
    } catch (err) {
      if (err instanceof PlaylistNotFoundError) {
        const msg = `create a playlist named '${chart.playlistName}' in Spotify first`;
        logger.error('chart: target playlist not found', {
          chart: chart.id,
          name: chart.playlistName,
        });
        syncRunsRepo.close(db, run.id, now().toISOString(), null, msg);
        return { kind: 'playlist_not_found', name: chart.playlistName };
      }
      throw err;
    }

    const result = await replacePlaylistTracks(playlistId, uris, accessToken);
    syncRunsRepo.close(db, run.id, now().toISOString(), uris.length, null);
    logger.info('chart: done', {
      chart: chart.id,
      entriesParsed: entries.length,
      tracksWritten: uris.length,
      snapshotId: result.snapshotId,
    });
    return {
      kind: 'ok',
      entriesParsed: entries.length,
      tracksWritten: uris.length,
      snapshotId: result.snapshotId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    syncRunsRepo.close(db, run.id, now().toISOString(), null, msg);
    throw err;
  }
};
