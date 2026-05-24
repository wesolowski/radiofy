import { eq } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type NewSpotifyMatch, type SpotifyMatch, spotifyMatches } from '../schema.ts';

export const matchesRepo = {
  upsert: (db: Db, row: NewSpotifyMatch): void => {
    db.insert(spotifyMatches)
      .values(row)
      .onConflictDoUpdate({
        target: spotifyMatches.songId,
        set: {
          spotifyTrackId: row.spotifyTrackId,
          score: row.score,
          matchedAt: row.matchedAt,
          sourceOfTruth: row.sourceOfTruth,
        },
      })
      .run();
  },

  get: (db: Db, songId: number): SpotifyMatch | undefined =>
    db.select().from(spotifyMatches).where(eq(spotifyMatches.songId, songId)).get(),
};
