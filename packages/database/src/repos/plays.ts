import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type NewPlay, plays } from '../schema.ts';

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
};
