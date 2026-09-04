import { runWeekly } from '../lib/weekly.ts';

const main = async (): Promise<void> => {
  const outcome = await runWeekly();
  if (outcome.blocked) process.exit(2);
  if (outcome.failed) process.exit(1);
};

await main();
