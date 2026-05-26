import { parseArgs } from 'node:util';

export interface StationArgs {
  station: string;
  day?: string;
  days?: number;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;

export const parseStationArgs = (
  argv: string[] = process.argv.slice(2),
  options: { allowDay?: boolean; allowDays?: boolean } = {},
): StationArgs => {
  const parsed = parseArgs({
    args: argv,
    options: {
      station: { type: 'string' },
      day: { type: 'string' },
      days: { type: 'string' },
    },
    strict: false,
  });
  const station = parsed.values.station;
  if (typeof station !== 'string' || station.length === 0) {
    throw new Error('--station=<id> is required');
  }

  const result: StationArgs = { station };

  if (options.allowDay === true) {
    const day = parsed.values.day;
    if (day !== undefined) {
      if (typeof day !== 'string' || !DAY_PATTERN.test(day)) {
        throw new Error('--day must be YYYY-MM-DD');
      }
      result.day = day;
    }
  }

  if (options.allowDays === true) {
    const raw = parsed.values.days;
    if (raw !== undefined) {
      if (typeof raw !== 'string') {
        throw new Error(`--days must be a positive integer <= ${MAX_DAYS}`);
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
        throw new Error(`--days must be a positive integer <= ${MAX_DAYS}`);
      }
      result.days = n;
    }
  }

  return result;
};
