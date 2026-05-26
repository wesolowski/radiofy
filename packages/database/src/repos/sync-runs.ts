import { and, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type NewPlaylistSyncRun, type PlaylistSyncRun, playlistSyncRuns } from '../schema.ts';

export const syncRunsRepo = {
  open: (db: Db, row: NewPlaylistSyncRun): PlaylistSyncRun => {
    const result = db.insert(playlistSyncRuns).values(row).returning().all();
    const inserted = result[0];
    if (!inserted) {
      throw new Error('syncRuns.open: no row returned');
    }
    return inserted;
  },

  close: (
    db: Db,
    id: number,
    finishedAtIso: string,
    tracksWritten: number | null,
    error: string | null,
  ): void => {
    db.update(playlistSyncRuns)
      .set({ finishedAt: finishedAtIso, tracksWritten, error })
      .where(eq(playlistSyncRuns.id, id))
      .run();
  },

  findOpen: (db: Db, station: string): PlaylistSyncRun[] =>
    db
      .select()
      .from(playlistSyncRuns)
      .where(and(eq(playlistSyncRuns.station, station), isNull(playlistSyncRuns.finishedAt)))
      .all(),

  findStuckOlderThan: (db: Db, cutoffIso: string): PlaylistSyncRun[] =>
    db
      .select()
      .from(playlistSyncRuns)
      .where(and(isNull(playlistSyncRuns.finishedAt), lt(playlistSyncRuns.startedAt, cutoffIso)))
      .all(),

  lastSuccess: (db: Db, station: string): PlaylistSyncRun | undefined =>
    db
      .select()
      .from(playlistSyncRuns)
      .where(
        and(
          eq(playlistSyncRuns.station, station),
          isNotNull(playlistSyncRuns.finishedAt),
          isNull(playlistSyncRuns.error),
        ),
      )
      .orderBy(desc(playlistSyncRuns.finishedAt))
      .limit(1)
      .get(),

  countClosedOlderThan: (db: Db, cutoffIso: string): number => {
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(playlistSyncRuns)
      .where(
        and(isNotNull(playlistSyncRuns.finishedAt), lt(playlistSyncRuns.finishedAt, cutoffIso)),
      )
      .get();
    return Number(row?.c ?? 0);
  },

  deleteClosedOlderThan: (db: Db, cutoffIso: string): number => {
    const before = db.select({ c: sql<number>`count(*)` }).from(playlistSyncRuns).get();
    db.delete(playlistSyncRuns)
      .where(
        and(isNotNull(playlistSyncRuns.finishedAt), lt(playlistSyncRuns.finishedAt, cutoffIso)),
      )
      .run();
    const after = db.select({ c: sql<number>`count(*)` }).from(playlistSyncRuns).get();
    return Number(before?.c ?? 0) - Number(after?.c ?? 0);
  },
};
