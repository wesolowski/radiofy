import { parseArgs } from 'node:util';

export interface StationArgs {
  station: string;
  day?: string;
  days?: number;
}

export interface OptionalStationArgs {
  station?: string;
  day?: string;
  days?: number;
}

interface ParseOptions {
  allowDay?: boolean;
  allowDays?: boolean;
  allowAllStations?: boolean;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;

export function parseStationArgs(
  argv?: string[],
  options?: ParseOptions & { allowAllStations?: false },
): StationArgs;
export function parseStationArgs(
  argv: string[],
  options: ParseOptions & { allowAllStations: true },
): OptionalStationArgs;
export function parseStationArgs(
  argv: string[] = process.argv.slice(2),
  options: ParseOptions = {},
): OptionalStationArgs {
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
  const hasStation = typeof station === 'string' && station.length > 0;
  if (!hasStation && options.allowAllStations !== true) {
    throw new Error('--station=<id> is required');
  }

  const result: OptionalStationArgs = hasStation ? { station } : {};

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
}
