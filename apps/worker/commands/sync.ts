import { logger } from '@radiofy/shared';
import { parseStationArgs } from '../lib/cli-args.ts';
import { loadEnabledStationIds } from '../lib/station-loader.ts';
import { runSync } from '../lib/sync.ts';

const main = async (): Promise<void> => {
  const args = parseStationArgs(process.argv.slice(2), { allowAllStations: true });

  const stations = args.station !== undefined ? [args.station] : loadEnabledStationIds();
  let failed = false;
  let blocked = false;

  for (const station of stations) {
    try {
      const outcome = await runSync({ station });
      if (outcome.kind === 'not_found') failed = true;
      if (outcome.kind === 'blocked') blocked = true;
      if (outcome.kind === 'playlist_not_found') failed = true;
    } catch (err) {
      logger.error('sync: failed', {
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
