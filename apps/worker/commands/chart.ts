import { loadCharts, logger } from '@radiofy/shared';
import { runChart } from '../lib/chart.ts';

const main = async (): Promise<void> => {
  const charts = loadCharts()
    .filter((c) => c.enabled)
    .map((c) => c.id);
  let failed = false;
  let blocked = false;

  for (const chart of charts) {
    try {
      const outcome = await runChart({ chart });
      if (outcome.kind === 'not_found') failed = true;
      if (outcome.kind === 'blocked') blocked = true;
      if (outcome.kind === 'playlist_not_found') failed = true;
      if (outcome.kind === 'implausible') failed = true;
      if (outcome.kind === 'no_songs') failed = true;
    } catch (err) {
      logger.error('chart: failed', {
        chart,
        error: err instanceof Error ? err.message : String(err),
      });
      failed = true;
    }
  }

  if (blocked) process.exit(2);
  if (failed) process.exit(1);
};

await main();
