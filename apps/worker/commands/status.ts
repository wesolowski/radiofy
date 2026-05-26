import { parseArgs } from 'node:util';
import { runStatus } from '../lib/status.ts';

const main = (): void => {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: { strict: { type: 'boolean' } },
    strict: false,
  });
  const strict = parsed.values.strict === true;
  const outcome = runStatus({ strict });
  if (outcome.exitCode !== 0) process.exit(outcome.exitCode);
};

main();
