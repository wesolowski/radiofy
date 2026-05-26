import { parseArgs } from 'node:util';

export interface StationArgs {
  station: string;
  day?: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseStationArgs = (
  argv: string[] = process.argv.slice(2),
  options: { allowDay?: boolean } = {},
): StationArgs => {
  const parsed = parseArgs({
    args: argv,
    options: {
      station: { type: 'string' },
      day: { type: 'string' },
    },
    strict: false,
  });
  const station = parsed.values.station;
  if (typeof station !== 'string' || station.length === 0) {
    throw new Error('--station=<id> is required');
  }
  if (options.allowDay !== true) {
    return { station };
  }
  const day = parsed.values.day;
  if (day === undefined) return { station };
  if (typeof day !== 'string' || !DAY_PATTERN.test(day)) {
    throw new Error('--day must be YYYY-MM-DD');
  }
  return { station, day };
};
