import { type Station, loadStations, logger } from '@radiofy/shared';

export type LoadResult =
  | { kind: 'ok'; station: Station }
  | { kind: 'disabled' }
  | { kind: 'not_found' };

export const loadStation = (id: string, stationsPath = 'config/stations.json'): LoadResult => {
  const stations = loadStations(stationsPath);
  const found = stations.find((s) => s.id === id);
  if (found === undefined) return { kind: 'not_found' };
  if (!found.enabled) {
    logger.info(`station ${id} is disabled, skipping`);
    return { kind: 'disabled' };
  }
  return { kind: 'ok', station: found };
};
