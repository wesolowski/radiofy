import { logger } from '@radiofy/shared';
import { parseStationArgs } from '../lib/cli-args.ts';
import { runCrawl } from '../lib/crawl.ts';

const main = async (): Promise<void> => {
  const args = parseStationArgs(process.argv.slice(2), { allowDay: true });
  try {
    const outcome = await runCrawl(args);
    if (outcome.kind === 'not_found') process.exit(1);
    if (outcome.kind === 'blocked') process.exit(2);
  } catch (err) {
    logger.error('crawl: failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
};

await main();
