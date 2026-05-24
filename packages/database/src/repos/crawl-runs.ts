import { and, eq, isNull, lt } from 'drizzle-orm';
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
};
