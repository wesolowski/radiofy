import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type NewPlay, plays, songs } from '../schema.ts';

export interface ResolutionInput {
  songId: number;
  source: string;
  sourceTrackId: string;
  normalizedKey: string;
  primaryArtist: string;
  allArtists: string;
  title: string;
  playCount: number;
  lastSeenAt: string;
}

export const playsRepo = {
  insert: (db: Db, row: NewPlay): void => {
    db.insert(plays).values(row).run();
  },

  countByStationInWindow: (db: Db, station: string, fromIso: string, toIso: string): number => {
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(plays)
      .where(
        and(eq(plays.station, station), gte(plays.playedAt, fromIso), lte(plays.playedAt, toIso)),
      )
      .get();
    return row?.c ?? 0;
  },

  findResolutionInputsInWindow: (db: Db, station: string, fromIso: string): ResolutionInput[] => {
    const playCount = sql<number>`count(*)`.as('play_count');
    const lastSeenAt = sql<string>`max(${plays.playedAt})`.as('last_seen_at');
    const sourceTrackId = sql<string>`max(${plays.sourceTrackId})`.as('source_track_id');
    const rows = db
      .select({
        songId: songs.id,
        source: plays.source,
        sourceTrackId,
        normalizedKey: songs.normalizedKey,
        primaryArtist: songs.primaryArtist,
        allArtists: songs.allArtists,
        title: songs.title,
        playCount,
        lastSeenAt,
      })
      .from(plays)
      .innerJoin(songs, eq(plays.songId, songs.id))
      .where(and(eq(plays.station, station), gte(plays.playedAt, fromIso)))
      .groupBy(songs.id, plays.source)
      .orderBy(desc(playCount), desc(lastSeenAt))
      .all();
    return rows.map((r) => ({
      songId: r.songId,
      source: r.source,
      sourceTrackId: r.sourceTrackId,
      normalizedKey: r.normalizedKey,
      primaryArtist: r.primaryArtist,
      allArtists: r.allArtists,
      title: r.title,
      playCount: Number(r.playCount),
      lastSeenAt: r.lastSeenAt,
    }));
  },

  countOlderThan: (db: Db, cutoffIso: string): number => {
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(plays)
      .where(lt(plays.playedAt, cutoffIso))
      .get();
    return Number(row?.c ?? 0);
  },

  deleteOlderThan: (db: Db, cutoffIso: string): number => {
    const before = db.select({ c: sql<number>`count(*)` }).from(plays).get();
    db.delete(plays).where(lt(plays.playedAt, cutoffIso)).run();
    const after = db.select({ c: sql<number>`count(*)` }).from(plays).get();
    return Number(before?.c ?? 0) - Number(after?.c ?? 0);
  },
};
