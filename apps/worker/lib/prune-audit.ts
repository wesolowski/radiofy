import { type Db, crawlRunsRepo, openDb, syncRunsRepo } from '@radiofy/database';

const DEFAULT_KEEP_DAYS = 90;

export interface PruneAuditOptions {
  db?: Db;
  keepDays?: number;
  dryRun?: boolean;
  now?: () => Date;
  stdout?: (line: string) => void;
}

export interface PruneAuditOutcome {
  cutoffIso: string;
  crawlRuns: number;
  syncRuns: number;
  dryRun: boolean;
}

export const runPruneAudit = (options: PruneAuditOptions = {}): PruneAuditOutcome => {
  const db = options.db ?? openDb();
  const keepDays = options.keepDays ?? DEFAULT_KEEP_DAYS;
  const dryRun = options.dryRun === true;
  const now = options.now ?? ((): Date => new Date());
  const stdout =
    options.stdout ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });

  const cutoffIso = new Date(now().getTime() - keepDays * 24 * 60 * 60 * 1000).toISOString();

  const crawlCount = dryRun
    ? crawlRunsRepo.countClosedOlderThan(db, cutoffIso)
    : crawlRunsRepo.deleteClosedOlderThan(db, cutoffIso);
  const syncCount = dryRun
    ? syncRunsRepo.countClosedOlderThan(db, cutoffIso)
    : syncRunsRepo.deleteClosedOlderThan(db, cutoffIso);

  const verb = dryRun ? 'would delete' : 'deleted';
  stdout(`prune-audit (keep-days=${keepDays}, cutoff=${cutoffIso})`);
  stdout(`  ${verb} ${crawlCount} crawl_runs row(s)`);
  stdout(`  ${verb} ${syncCount} playlist_sync_runs row(s)`);

  return { cutoffIso, crawlRuns: crawlCount, syncRuns: syncCount, dryRun };
};
