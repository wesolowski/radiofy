import { parseArgs } from 'node:util';
import { runExportUnmatched } from '../lib/export-unmatched.ts';

const main = (): void => {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      station: { type: 'string' },
      since: { type: 'string' },
      all: { type: 'boolean' },
    },
    strict: false,
  });
  const station = typeof parsed.values.station === 'string' ? parsed.values.station : undefined;
  const since = typeof parsed.values.since === 'string' ? parsed.values.since : undefined;
  const all = parsed.values.all === true;
  runExportUnmatched({
    ...(station !== undefined ? { station } : {}),
    ...(since !== undefined ? { since } : {}),
    all,
  });
};

main();
