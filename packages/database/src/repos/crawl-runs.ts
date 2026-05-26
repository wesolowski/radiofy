import { and, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { type CrawlRun, type NewCrawlRun, crawlRuns } from '../schema.ts';

export const crawlRunsRepo = {
  open: (db: Db, row: NewCrawlRun): CrawlRun => {
    const result = db.insert(crawlRuns).values(row).returning().all();
    const inserted = result[0];
    if (!inserted) {
      throw new Error('crawlRuns.open: no row returned');
    }
    return inserted;
  },

  close: (
    db: Db,
    id: number,
    finishedAtIso: string,
    songsSeen: number | null,
    error: string | null,
  ): void => {
    db.update(crawlRuns)
      .set({ finishedAt: finishedAtIso, songsSeen, error })
      .where(eq(crawlRuns.id, id))
      .run();
  },

  findOpen: (db: Db, station: string): CrawlRun[] =>
    db
      .select()
      .from(crawlRuns)
      .where(and(eq(crawlRuns.station, station), isNull(crawlRuns.finishedAt)))
      .all(),

  findStuckOlderThan: (db: Db, cutoffIso: string): CrawlRun[] =>
    db
      .select()
      .from(crawlRuns)
      .where(and(isNull(crawlRuns.finishedAt), lt(crawlRuns.startedAt, cutoffIso)))
      .all(),

  lastSuccess: (db: Db, station: string): CrawlRun | undefined =>
    db
      .select()
      .from(crawlRuns)
      .where(
        and(
          eq(crawlRuns.station, station),
          isNotNull(crawlRuns.finishedAt),
          isNull(crawlRuns.error),
        ),
      )
      .orderBy(desc(crawlRuns.finishedAt))
      .limit(1)
      .get(),

  countClosedOlderThan: (db: Db, cutoffIso: string): number => {
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(crawlRuns)
      .where(and(isNotNull(crawlRuns.finishedAt), lt(crawlRuns.finishedAt, cutoffIso)))
      .get();
    return Number(row?.c ?? 0);
  },

  deleteClosedOlderThan: (db: Db, cutoffIso: string): number => {
    const before = db.select({ c: sql<number>`count(*)` }).from(crawlRuns).get();
    db.delete(crawlRuns)
      .where(and(isNotNull(crawlRuns.finishedAt), lt(crawlRuns.finishedAt, cutoffIso)))
      .run();
    const after = db.select({ c: sql<number>`count(*)` }).from(crawlRuns).get();
    return Number(before?.c ?? 0) - Number(after?.c ?? 0);
  },
};
