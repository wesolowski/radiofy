import { parseArgs } from 'node:util';
import { logger } from '@radiofy/shared';
import { runExportPlaylist } from '../lib/export-playlist.ts';

const main = async (): Promise<void> => {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: { name: { type: 'string' } },
    strict: false,
  });
  const name = parsed.values.name;
  if (typeof name !== 'string' || name.length === 0) {
    logger.error('--name="<playlist name>" is required');
    process.exit(1);
  }
  const outcome = await runExportPlaylist({ name });
  if (outcome.kind === 'not_found') {
    logger.error(`no playlist named '${outcome.name}' in the user's library`);
    process.exit(1);
  }
};

await main();
