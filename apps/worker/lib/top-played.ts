import { type Db, openDb, playsRepo } from '@radiofy/database';
import { type Station, loadStations, rollingWeekWindow } from '@radiofy/shared';

const DEFAULT_LIMIT = 20;
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export interface TopPlayedOptions {
  db?: Db;
  station?: string;
  limit?: number;
  since?: string;
  stationsPath?: string;
  now?: () => Date;
  stdout?: (line: string) => void;
  color?: boolean;
}

export interface TopPlayedRow {
  rank: number;
  plays: number;
  primaryArtist: string;
  title: string;
}

export interface TopPlayedBlock {
  station: Station;
  rows: TopPlayedRow[];
}

export interface TopPlayedOutcome {
  blocks: TopPlayedBlock[];
}

const sinceIso = (options: TopPlayedOptions): string => {
  if (options.since !== undefined) return `${options.since}T00:00:00.000Z`;
  const now = options.now ?? ((): Date => new Date());
  return rollingWeekWindow(now()).from.toISOString();
};

const stationsToScan = (options: TopPlayedOptions): Station[] => {
  const all = loadStations(options.stationsPath).filter((s) => s.enabled);
  if (options.station === undefined) return all;
  return all.filter((s) => s.id === options.station);
};

const padStart = (s: string, width: number): string => {
  if (s.length >= width) return s;
  return ' '.repeat(width - s.length) + s;
};

export const runTopPlayed = (options: TopPlayedOptions = {}): TopPlayedOutcome => {
  const db = options.db ?? openDb();
  const stdout =
    options.stdout ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });
  const color = options.color ?? process.stdout.isTTY === true;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const fromIso = sinceIso(options);

  const stations = stationsToScan(options);
  const blocks: TopPlayedBlock[] = [];

  for (const station of stations) {
    const raw = playsRepo.findResolutionInputsInWindow(db, station.id, fromIso);
    const top = raw.slice(0, limit).map((row, idx) => ({
      rank: idx + 1,
      plays: row.playCount,
      primaryArtist: row.primaryArtist,
      title: row.title,
    }));
    blocks.push({ station, rows: top });
  }

  for (const block of blocks) {
    stdout('');
    const heading = `${block.station.name} (last 7 days since ${fromIso})`;
    stdout(color ? `${DIM}${heading}${RESET}` : heading);
    stdout('────────────────────────────────────────────────────────────────────────────────');
    if (block.rows.length === 0) {
      stdout('  no plays in window');
      continue;
    }
    stdout(`${padStart('#', 3)}  ${padStart('plays', 5)}  song`);
    for (const row of block.rows) {
      stdout(
        `${padStart(String(row.rank), 3)}  ${padStart(String(row.plays), 5)}  ${row.primaryArtist} - ${row.title}`,
      );
    }
  }

  return { blocks };
};
