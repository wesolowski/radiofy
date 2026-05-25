import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStation } from '../lib/station-loader.ts';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-stations-'));
  path = join(dir, 'stations.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const writeStations = (stations: unknown[]): void => {
  writeFileSync(path, JSON.stringify(stations));
};

describe('loadStation', () => {
  test('returns ok with the station for enabled match', () => {
    writeStations([
      {
        id: 'radio-zet',
        name: 'ZET',
        source: 'malopolskie-media',
        sourceSlug: 'radio-zet',
        playlistName: 'Radio Zet Weekly Playlist',
        enabled: true,
      },
    ]);
    const result = loadStation('radio-zet', path);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.station.id).toBe('radio-zet');
  });

  test('returns disabled for an enabled=false station', () => {
    writeStations([
      {
        id: 'radio-zet',
        name: 'ZET',
        source: 'malopolskie-media',
        sourceSlug: 'radio-zet',
        playlistName: 'Radio Zet Weekly Playlist',
        enabled: false,
      },
    ]);
    expect(loadStation('radio-zet', path).kind).toBe('disabled');
  });

  test('returns not_found when the id is absent', () => {
    writeStations([]);
    expect(loadStation('radio-zet', path).kind).toBe('not_found');
  });
});
