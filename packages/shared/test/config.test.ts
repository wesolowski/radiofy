import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadLogLevel, loadStations } from '../src/config.ts';

describe('loadConfig', () => {
  test('returns typed config when all required vars are present', () => {
    const cfg = loadConfig({
      SPOTIFY_CLIENT_ID: 'cid',
      SPOTIFY_CLIENT_SECRET: 'secret',
      SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:8888/callback',
      LOG_LEVEL: 'debug',
    });
    expect(cfg.SPOTIFY_CLIENT_ID).toBe('cid');
    expect(cfg.LOG_LEVEL).toBe('debug');
  });

  test('throws naming the missing variable', () => {
    expect(() => loadConfig({ SPOTIFY_CLIENT_SECRET: 'secret' })).toThrow(/SPOTIFY_CLIENT_ID/);
  });

  test('defaults SPOTIFY_REDIRECT_URI and LOG_LEVEL', () => {
    const cfg = loadConfig({
      SPOTIFY_CLIENT_ID: 'cid',
      SPOTIFY_CLIENT_SECRET: 'secret',
    });
    expect(cfg.SPOTIFY_REDIRECT_URI).toBe('http://127.0.0.1:8888/callback');
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  test('rejects an invalid LOG_LEVEL value', () => {
    expect(() =>
      loadConfig({
        SPOTIFY_CLIENT_ID: 'cid',
        SPOTIFY_CLIENT_SECRET: 'secret',
        LOG_LEVEL: 'verbose',
      }),
    ).toThrow(/LOG_LEVEL/);
  });
});

describe('loadLogLevel', () => {
  test('honors a valid LOG_LEVEL', () => {
    expect(loadLogLevel({ LOG_LEVEL: 'warn' })).toBe('warn');
  });

  test('falls back to info when LOG_LEVEL is missing', () => {
    expect(loadLogLevel({})).toBe('info');
  });

  test('falls back to info when LOG_LEVEL is malformed', () => {
    expect(loadLogLevel({ LOG_LEVEL: 'noisy' })).toBe('info');
  });
});

describe('loadStations', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'radiofy-stations-'));
    path = join(dir, 'stations.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('parses a valid stations array', () => {
    writeFileSync(
      path,
      JSON.stringify([
        {
          id: 'radio-zet',
          name: 'ZET',
          source: 'malopolskie-media',
          sourceSlug: 'radio-zet',
          playlistName: 'Radio Zet Weekly Playlist',
          enabled: true,
        },
      ]),
    );
    const stations = loadStations(path);
    expect(stations).toHaveLength(1);
    expect(stations[0]?.id).toBe('radio-zet');
  });

  test('throws with a precise path when a required field is missing', () => {
    writeFileSync(
      path,
      JSON.stringify([
        {
          id: 'radio-zet',
          name: 'ZET',
          sourceSlug: 'radio-zet',
          playlistName: 'Radio Zet Weekly Playlist',
          enabled: true,
        },
      ]),
    );
    expect(() => loadStations(path)).toThrow(/stations\[0\]\.source/);
  });

  test('throws when the JSON is not an array', () => {
    writeFileSync(path, JSON.stringify({ not: 'an array' }));
    expect(() => loadStations(path)).toThrow(/stations/);
  });

  test('throws when the file is not valid JSON', () => {
    writeFileSync(path, '{ broken');
    expect(() => loadStations(path)).toThrow(/not valid JSON/);
  });
});
