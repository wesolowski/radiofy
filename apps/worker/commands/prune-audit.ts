import { parseArgs } from 'node:util';
import { runPruneAudit } from '../lib/prune-audit.ts';

const main = (): void => {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      'keep-days': { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
    strict: false,
  });
  const keepDaysRaw = parsed.values['keep-days'];
  const keepDays = typeof keepDaysRaw === 'string' ? Number(keepDaysRaw) : undefined;
  if (keepDays !== undefined && (Number.isNaN(keepDays) || keepDays < 0)) {
    process.stderr.write('--keep-days must be a non-negative integer\n');
    process.exit(1);
  }
  runPruneAudit({
    ...(keepDays !== undefined ? { keepDays } : {}),
    dryRun: parsed.values['dry-run'] === true,
  });
};

main();
