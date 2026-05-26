import { type ParseInput, parse } from './parse.ts';
import { buildUrl } from './url.ts';

export const ODSLUCHANE_EU_ID = 'odsluchane-eu' as const;

/**
 * Station id map for odsluchane.eu's ?r= query parameter.
 *
 * Values come from probing the site's URL pattern; see
 * docs/architecture/PROJECT_ARCHITECTURE.md → "Data Sources" for the
 * full table and how new stations are added.
 */
export const ODSLUCHANE_EU_STATIONS = {
  'radio-zet': '1',
  'rmf-fm': '2',
  'radio-eska': '3',
  'rmf-maxx': '4',
} as const;

/**
 * odsluchane.eu rejects very wide windows (time_to=24 silently truncates;
 * 12-hour windows return zero songs). Three 10-ish-hour windows cover the
 * full day reliably, with time_to=0 acting as "end of day" for the last
 * slot. Boundary songs at 10:00 / 20:00 may appear in two adjacent windows;
 * the DB UNIQUE constraint on (source, source_track_id, station, played_at)
 * silently dedupes the overlap on insert.
 */
const FULL_DAY_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [0, 10],
  [10, 20],
  [20, 0],
];

const dayUrls = (stationId: string, day: string): string[] =>
  FULL_DAY_WINDOWS.map(([from, to]) => buildUrl(stationId, day, from, to));

export const odsluchaneEuSource = {
  id: ODSLUCHANE_EU_ID,
  buildUrl,
  dayUrls,
  parse,
} as const;

export { buildUrl, dayUrls, parse };
export type { ParseInput };
