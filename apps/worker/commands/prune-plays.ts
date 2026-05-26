import { parseArgs } from 'node:util';
import { runPrunePlays } from '../lib/prune-plays.ts';

const main = (): void => {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      'keep-days': { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
    strict: false,
  });
  const raw = parsed.values['keep-days'];
  const keepDays = typeof raw === 'string' ? Number(raw) : undefined;
  if (keepDays !== undefined && (!Number.isInteger(keepDays) || keepDays < 1)) {
    process.stderr.write('--keep-days must be a positive integer\n');
    process.exit(1);
  }
  try {
    runPrunePlays({
      ...(keepDays !== undefined ? { keepDays } : {}),
      dryRun: parsed.values['dry-run'] === true,
    });
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
};

main();
