import {
  type Db,
  type ResolutionInput,
  applyMigrations,
  openDb,
  playsRepo,
  syncRunsRepo,
} from '@radiofy/database';
import { type OverrideTable, loadOverrides, resolveSong } from '@radiofy/matcher';
import { type NormalizedSong, type RawSong, logger, rollingWeekWindow } from '@radiofy/shared';
import {
  PlaylistNotFoundError,
  getAccessToken,
  getPlaylistByName,
  replacePlaylistTracks,
} from '@radiofy/spotify';
import { loadStation } from './station-loader.ts';

const OVERLAP_CUTOFF_MS = 5 * 60 * 1000;
const OVERRIDES_PATH = 'storage/overrides.json';

export interface SyncOptions {
  station: string;
  db?: Db;
  stationsPath?: string;
  overridesPath?: string;
  accessToken?: string;
  now?: () => Date;
}

export type SyncOutcome =
  | { kind: 'ok'; tracksWritten: number; snapshotId: string }
  | { kind: 'no_songs' }
  | { kind: 'playlist_not_found'; name: string }
  | { kind: 'disabled' }
  | { kind: 'not_found' }
  | { kind: 'blocked' };

const buildContext = (row: ResolutionInput): { rawSong: RawSong; normalized: NormalizedSong } => {
  const normalized: NormalizedSong = {
    normalizedKey: row.normalizedKey,
    primaryArtist: row.primaryArtist,
    allArtists: row.allArtists,
    title: row.title,
    originalArtists: row.allArtists.split('|'),
    originalTitle: row.title,
  };
  const rawSong: RawSong = {
    sourceTrackId: row.sourceTrackId,
    displayText: '',
    artists: normalized.originalArtists,
    title: normalized.title,
    playedAt: row.lastSeenAt,
  };
  return { rawSong, normalized };
};

export const runSync = async (options: SyncOptions): Promise<SyncOutcome> => {
  logger.bindRunFile(`storage/logs/sync-${options.station}.log`);
  const db = options.db ?? openDb();
  applyMigrations(db);
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

  const cutoff = new Date(now().getTime() - OVERLAP_CUTOFF_MS).toISOString();
  const openRuns = syncRunsRepo.findOpen(db, station.id);
  for (const r of openRuns) {
    if (r.startedAt >= cutoff) {
      logger.error('sync: another sync is in progress for this station', {
        runId: r.id,
        startedAt: r.startedAt,
      });
      return { kind: 'blocked' };
    }
    logger.warn('sync: overriding crashed run', { runId: r.id });
    syncRunsRepo.close(db, r.id, now().toISOString(), null, 'crashed (no heartbeat)');
  }

  const run = syncRunsRepo.open(db, {
    station: station.id,
    startedAt: now().toISOString(),
  });

  try {
    const overrides: OverrideTable = loadOverrides(options.overridesPath ?? OVERRIDES_PATH);
    const accessToken = options.accessToken ?? (await getAccessToken());

    const window = rollingWeekWindow(now());
    const candidates = playsRepo.findResolutionInputsInWindow(
      db,
      station.id,
      window.from.toISOString(),
    );
    logger.info('sync: candidates', { station: station.id, count: candidates.length });

    const resolved = new Map<string, { plays: number; lastSeenAt: string }>();
    for (const row of candidates) {
      const { rawSong, normalized } = buildContext(row);
      const outcome = await resolveSong({
        db,
        overrides,
        accessToken,
        source: row.source,
        station: station.id,
        rawSong,
        normalized,
      });
      if (outcome.kind === 'override' || outcome.kind === 'cache' || outcome.kind === 'auto') {
        const prev = resolved.get(outcome.spotifyTrackId);
        if (prev === undefined) {
          resolved.set(outcome.spotifyTrackId, {
            plays: row.playCount,
            lastSeenAt: row.lastSeenAt,
          });
        } else {
          prev.plays += row.playCount;
          if (row.lastSeenAt > prev.lastSeenAt) prev.lastSeenAt = row.lastSeenAt;
        }
      }
    }

    const sorted = [...resolved.entries()].sort(([, a], [, b]) => {
      if (b.plays !== a.plays) return b.plays - a.plays;
      return b.lastSeenAt.localeCompare(a.lastSeenAt);
    });
    const uris = sorted.map(([id]) => id);

    if (uris.length === 0) {
      logger.warn('sync: no resolvable songs in window — skipping playlist replace', {
        station: station.id,
      });
      syncRunsRepo.close(db, run.id, now().toISOString(), 0, null);
      return { kind: 'no_songs' };
    }

    let playlistId: string;
    try {
      const found = await getPlaylistByName(station.playlistName, accessToken);
      playlistId = found.id;
    } catch (err) {
      if (err instanceof PlaylistNotFoundError) {
        const msg = `create a playlist named '${station.playlistName}' in Spotify first`;
        logger.error('sync: target playlist not found', {
          station: station.id,
          name: station.playlistName,
        });
        syncRunsRepo.close(db, run.id, now().toISOString(), null, msg);
        return { kind: 'playlist_not_found', name: station.playlistName };
      }
      throw err;
    }

    const result = await replacePlaylistTracks(playlistId, uris, accessToken);
    syncRunsRepo.close(db, run.id, now().toISOString(), uris.length, null);
    logger.info('sync: done', {
      station: station.id,
      tracksWritten: uris.length,
      snapshotId: result.snapshotId,
    });
    return { kind: 'ok', tracksWritten: uris.length, snapshotId: result.snapshotId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    syncRunsRepo.close(db, run.id, now().toISOString(), null, msg);
    throw err;
  }
};
