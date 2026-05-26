import { parseArgs } from 'node:util';
import { runTopPlayed } from '../lib/top-played.ts';

const main = (): void => {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      station: { type: 'string' },
      limit: { type: 'string' },
      since: { type: 'string' },
    },
    strict: false,
  });
  const station = typeof parsed.values.station === 'string' ? parsed.values.station : undefined;
  const limitRaw = parsed.values.limit;
  const limit = typeof limitRaw === 'string' ? Number(limitRaw) : undefined;
  if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
    process.stderr.write('--limit must be a positive integer\n');
    process.exit(1);
  }
  const since = typeof parsed.values.since === 'string' ? parsed.values.since : undefined;
  runTopPlayed({
    ...(station !== undefined ? { station } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(since !== undefined ? { since } : {}),
  });
};

main();
