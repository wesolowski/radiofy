import { eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type NewUnmatchedSong, type UnmatchedSong, unmatchedSongs } from '../schema.ts';

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
};
