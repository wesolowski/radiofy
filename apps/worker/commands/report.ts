import { runReport } from '../lib/report.ts';

const main = (): void => {
  const { path } = runReport();
  process.stdout.write(`${path}\n`);
};

main();
