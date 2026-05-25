import { logger } from '@radiofy/shared';
import { parseStationArgs } from '../lib/cli-args.ts';
import { runSync } from '../lib/sync.ts';

const main = async (): Promise<void> => {
  const args = parseStationArgs(process.argv.slice(2));
  try {
    const outcome = await runSync(args);
    if (outcome.kind === 'not_found') process.exit(1);
    if (outcome.kind === 'blocked') process.exit(2);
    if (outcome.kind === 'playlist_not_found') process.exit(1);
  } catch (err) {
    logger.error('sync: failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
};

await main();
