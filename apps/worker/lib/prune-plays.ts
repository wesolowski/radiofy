import { type Db, openDb, playsRepo } from '@radiofy/database';

const DEFAULT_KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PrunePlaysOptions {
  db?: Db;
  keepDays?: number;
  dryRun?: boolean;
  now?: () => Date;
  stdout?: (line: string) => void;
}

export interface PrunePlaysOutcome {
  cutoffIso: string;
  plays: number;
  dryRun: boolean;
}

export const runPrunePlays = (options: PrunePlaysOptions = {}): PrunePlaysOutcome => {
  const db = options.db ?? openDb();
  const keepDays = options.keepDays ?? DEFAULT_KEEP_DAYS;
  const dryRun = options.dryRun === true;
  const now = options.now ?? ((): Date => new Date());
  const stdout =
    options.stdout ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });

  if (!Number.isInteger(keepDays) || keepDays < 1) {
    throw new Error('--keep-days must be a positive integer');
  }

  const cutoffIso = new Date(now().getTime() - keepDays * DAY_MS).toISOString();
  const count = dryRun
    ? playsRepo.countOlderThan(db, cutoffIso)
    : playsRepo.deleteOlderThan(db, cutoffIso);

  const verb = dryRun ? 'would delete' : 'deleted';
  stdout(`prune-plays (keep-days=${keepDays}, cutoff=${cutoffIso})`);
  stdout(`  ${verb} ${count} plays row(s)`);

  return { cutoffIso, plays: count, dryRun };
};
