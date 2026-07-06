import { logger } from '@radiofy/shared';
import { parseStationArgs } from '../lib/cli-args.ts';
import { type CrawlOptions, runCrawl } from '../lib/crawl.ts';
import { loadEnabledStationIds } from '../lib/station-loader.ts';

const main = async (): Promise<void> => {
  const args = parseStationArgs(process.argv.slice(2), {
    allowDay: true,
    allowDays: true,
    allowAllStations: true,
  });
  if (args.day !== undefined && args.days !== undefined) {
    logger.warn('crawl: --day overrides --days; --days ignored', {
      day: args.day,
      days: args.days,
    });
  }

  const stations = args.station !== undefined ? [args.station] : loadEnabledStationIds();
  let failed = false;
  let blocked = false;

  for (const station of stations) {
    const crawlArgs: CrawlOptions = { station };
    if (args.day !== undefined) crawlArgs.day = args.day;
    else if (args.days !== undefined) crawlArgs.days = args.days;
    try {
      const outcome = await runCrawl(crawlArgs);
      if (outcome.kind === 'not_found') failed = true;
      if (outcome.kind === 'blocked') blocked = true;
    } catch (err) {
      logger.error('crawl: failed', {
        station,
        error: err instanceof Error ? err.message : String(err),
      });
      failed = true;
    }
  }

  if (blocked) process.exit(2);
  if (failed) process.exit(1);
};

await main();
