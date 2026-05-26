import { and, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type NewUnmatchedSong, type UnmatchedSong, unmatchedSongs } from '../schema.ts';

export interface UnmatchedQuery {
  station?: string;
  sinceIso?: string;
  includeResolved?: boolean;
}

export const unmatchedRepo = {
  upsertOccurrence: (db: Db, row: NewUnmatchedSong): void => {
    db.insert(unmatchedSongs)
      .values(row)
      .onConflictDoUpdate({
        target: unmatchedSongs.normalizedKey,
        set: {
          occurrenceCount: sql`${unmatchedSongs.occurrenceCount} + 1`,
          lastSeenAt: row.lastSeenAt,
          reason: row.reason,
          bestCandidateSpotifyId: row.bestCandidateSpotifyId ?? null,
          bestCandidateScore: row.bestCandidateScore ?? null,
        },
      })
      .run();
  },

  listOpen: (db: Db): UnmatchedSong[] =>
    db.select().from(unmatchedSongs).where(isNull(unmatchedSongs.resolvedAt)).all(),

  markResolved: (db: Db, normalizedKey: string, resolvedAtIso: string): void => {
    db.update(unmatchedSongs)
      .set({ resolvedAt: resolvedAtIso })
      .where(eq(unmatchedSongs.normalizedKey, normalizedKey))
      .run();
  },

  getByNormalizedKey: (db: Db, normalizedKey: string): UnmatchedSong | undefined =>
    db.select().from(unmatchedSongs).where(eq(unmatchedSongs.normalizedKey, normalizedKey)).get(),

  list: (db: Db, query: UnmatchedQuery = {}): UnmatchedSong[] => {
    const filters = [];
    if (query.station !== undefined) filters.push(eq(unmatchedSongs.station, query.station));
    if (query.sinceIso !== undefined) filters.push(gte(unmatchedSongs.firstSeenAt, query.sinceIso));
    if (query.includeResolved !== true) filters.push(isNull(unmatchedSongs.resolvedAt));
    const where = filters.length === 0 ? undefined : and(...filters);
    const base = db.select().from(unmatchedSongs);
    const filtered = where === undefined ? base : base.where(where);
    return filtered
      .orderBy(desc(unmatchedSongs.occurrenceCount), desc(unmatchedSongs.lastSeenAt))
      .all();
  },

  countOpen: (db: Db, station?: string): number => {
    const filters = [isNull(unmatchedSongs.resolvedAt)];
    if (station !== undefined) filters.push(eq(unmatchedSongs.station, station));
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(unmatchedSongs)
      .where(and(...filters))
      .get();
    return Number(row?.c ?? 0);
  },
};

export { isNotNull };
