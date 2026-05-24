import { eq } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type NewSong, type Song, songs } from '../schema.ts';

export const songsRepo = {
  upsertByNormalizedKey: (db: Db, row: NewSong): Song => {
    const result = db
      .insert(songs)
      .values(row)
      .onConflictDoUpdate({
        target: songs.normalizedKey,
        set: {
          primaryArtist: row.primaryArtist,
          allArtists: row.allArtists,
          title: row.title,
        },
      })
      .returning()
      .all();
    const inserted = result[0];
    if (!inserted) {
      throw new Error(`songs.upsertByNormalizedKey: no row returned for ${row.normalizedKey}`);
    }
    return inserted;
  },

  getByNormalizedKey: (db: Db, normalizedKey: string): Song | undefined =>
    db.select().from(songs).where(eq(songs.normalizedKey, normalizedKey)).get(),

  getById: (db: Db, id: number): Song | undefined =>
    db.select().from(songs).where(eq(songs.id, id)).get(),
};
