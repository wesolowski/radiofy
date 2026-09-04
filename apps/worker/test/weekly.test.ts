import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Db,
  applyMigrations,
  crawlRunsRepo,
  openInMemoryDb,
  syncRunsRepo,
} from '@radiofy/database';
import { runWeekly } from '../lib/weekly.ts';

const FIXTURE_PATH = 'packages/sources/test/malopolskie-media/fixtures/radio-zet-2026-05-24.html';

const MATCHED_TRACK_ID = 'aaaaaaaaaaaaaaaaaaaaaa';

const STATION = {
  id: 'radio-zet',
  name: 'ZET',
  source: 'malopolskie-media',
  sourceSlug: 'radio-zet',
  playlistName: 'Radio Zet Weekly Playlist',
  enabled: true,
};

let dir: string;
let stationsPath: string;
let overridesPath: string;
let db: Db;
let html: string;
let originalFetch: typeof globalThis.fetch;
let playlistWrites: string[];

const fakeNow = (): Date => new Date('2026-05-26T12:00:00.000Z');

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const echoedSearchHit = (searchUrl: string): Response => {
  const q = new URL(searchUrl).searchParams.get('q') ?? '';
  const parsed = /^artist:(.*) track:(.*)$/.exec(q);
  if (parsed === null) return jsonResponse({ tracks: { items: [] } });
  return jsonResponse({
    tracks: {
      items: [
        {
          id: MATCHED_TRACK_ID,
          name: parsed[2],
          artists: [{ name: parsed[1] }],
          duration_ms: 200_000,
        },
      ],
    },
  });
};

const installFetch = (
  radioResponder: (url: string) => Response,
  search: 'match' | 'none' = 'none',
): void => {
  playlistWrites = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const method = init?.method ?? 'GET';
    if (resolved.includes('/v1/me/playlists')) {
      return jsonResponse({ items: [{ id: 'PID', name: STATION.playlistName }], next: null });
    }
    if (resolved.includes('/v1/search')) {
      return search === 'match'
        ? echoedSearchHit(resolved)
        : jsonResponse({ tracks: { items: [] } });
    }
    if (resolved.includes('/v1/playlists/')) {
      playlistWrites.push(method);
      return jsonResponse({ snapshot_id: 'snap' });
    }
    return radioResponder(resolved);
  }) as typeof globalThis.fetch;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-weekly-'));
  stationsPath = join(dir, 'stations.json');
  overridesPath = join(dir, 'overrides.json');
  writeFileSync(stationsPath, JSON.stringify([STATION]));
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  html = readFileSync(FIXTURE_PATH, 'utf-8');
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

describe('runWeekly', () => {
  test('crawls and then syncs every enabled station', async () => {
    installFetch(() => new Response(html, { status: 200 }), 'match');

    const outcome = await runWeekly({
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });

    expect(outcome.stations).toBe(1);
    expect(outcome.failed).toBe(false);
    expect(outcome.blocked).toBe(false);

    const lastCrawl = crawlRunsRepo.lastSuccess(db, STATION.id);
    expect(lastCrawl).toBeDefined();
    expect(lastCrawl?.songsSeen ?? 0).toBeGreaterThan(0);

    const lastSync = syncRunsRepo.lastSuccess(db, STATION.id);
    expect(lastSync).toBeDefined();
    expect(lastSync?.tracksWritten ?? 0).toBeGreaterThan(0);
    expect(playlistWrites).toContain('PUT');
    expect(playlistWrites).toContain('POST');
  });

  test('a permanently failing crawl day does not stop the sync phase', async () => {
    installFetch((url) =>
      url.includes('2026-05-24')
        ? new Response('boom', { status: 503 })
        : new Response(html, { status: 200 }),
    );

    const outcome = await runWeekly({
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });

    expect(outcome.failed).toBe(true);
    expect(outcome.blocked).toBe(false);
    expect(syncRunsRepo.lastSuccess(db, STATION.id)).toBeDefined();
    expect(playlistWrites).toEqual([]);
  });

  test('skips a disabled station in both phases', async () => {
    writeFileSync(stationsPath, JSON.stringify([{ ...STATION, enabled: false }]));
    installFetch(() => new Response(html, { status: 200 }));

    const outcome = await runWeekly({
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });

    expect(outcome.stations).toBe(0);
    expect(outcome.failed).toBe(false);
    expect(crawlRunsRepo.lastSuccess(db, STATION.id)).toBeUndefined();
    expect(syncRunsRepo.lastSuccess(db, STATION.id)).toBeUndefined();
  });

  test('reports blocked when a crawl is already in flight for the station', async () => {
    crawlRunsRepo.open(db, {
      station: STATION.id,
      day: '2026-05-25',
      startedAt: '2026-05-26T11:59:00.000Z',
    });
    installFetch(() => new Response(html, { status: 200 }));

    const outcome = await runWeekly({
      db,
      stationsPath,
      overridesPath,
      accessToken: 'token',
      now: fakeNow,
    });

    expect(outcome.blocked).toBe(true);
  });
});
