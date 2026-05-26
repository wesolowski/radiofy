import { beforeEach, describe, expect, test } from 'bun:test';
import {
  type Db,
  applyMigrations,
  crawlRunsRepo,
  openInMemoryDb,
  syncRunsRepo,
} from '@radiofy/database';
import { runPruneAudit } from '../lib/prune-audit.ts';

const NOW = new Date('2026-05-26T12:00:00.000Z');
const fakeNow = (): Date => NOW;

let db: Db;
let lines: string[];
const stdout = (line: string): void => {
  lines.push(line);
};

const seedClosed = (kind: 'crawl' | 'sync', startedAt: string, finishedAt: string): void => {
  if (kind === 'crawl') {
    const r = crawlRunsRepo.open(db, { station: 'radio-zet', day: '2026-01-01', startedAt });
    crawlRunsRepo.close(db, r.id, finishedAt, 100, null);
  } else {
    const r = syncRunsRepo.open(db, { station: 'radio-zet', startedAt });
    syncRunsRepo.close(db, r.id, finishedAt, 50, null);
  }
};

beforeEach(() => {
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  lines = [];

  seedClosed('crawl', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:05.000Z');
  seedClosed('crawl', '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:05.000Z');
  seedClosed('sync', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:05.000Z');
  crawlRunsRepo.open(db, {
    station: 'radio-zet',
    day: '2026-05-26',
    startedAt: '2026-05-26T11:30:00.000Z',
  });
});

describe('runPruneAudit', () => {
  test('--dry-run reports counts and does not delete', () => {
    const out = runPruneAudit({ db, keepDays: 30, dryRun: true, now: fakeNow, stdout });
    expect(out.dryRun).toBe(true);
    expect(out.crawlRuns).toBe(1);
    expect(out.syncRuns).toBe(1);
    const stillThere = crawlRunsRepo.findStuckOlderThan(db, '9999-12-31T00:00:00.000Z').length;
    expect(stillThere).toBe(1);
  });

  test('non-dry-run actually deletes the rows', () => {
    runPruneAudit({ db, keepDays: 30, now: fakeNow, stdout });
    const out2 = runPruneAudit({ db, keepDays: 30, dryRun: true, now: fakeNow, stdout });
    expect(out2.crawlRuns).toBe(0);
    expect(out2.syncRuns).toBe(0);
  });

  test('does not touch open runs (finished_at IS NULL)', () => {
    runPruneAudit({ db, keepDays: 30, now: fakeNow, stdout });
    const open = crawlRunsRepo.findOpen(db, 'radio-zet');
    expect(open).toHaveLength(1);
  });

  test('keep-days=90 keeps the 2026-05-20 row but drops 2026-01-01', () => {
    const out = runPruneAudit({ db, keepDays: 90, dryRun: true, now: fakeNow, stdout });
    expect(out.crawlRuns).toBe(1);
  });
});
