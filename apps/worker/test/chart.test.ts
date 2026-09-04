import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Db, applyMigrations, openInMemoryDb, syncRunsRepo } from '@radiofy/database';
import { runChart } from '../lib/chart.ts';

const FIXTURE_PATH = 'packages/sources/test/eska-goraca20/fixtures/goraca20.html';

const CHART = {
  id: 'eska-goraca20',
  name: 'Eska Gorąca 20',
  source: 'eska-goraca20',
  url: 'https://www.eska.pl/goraca20/',
  playlistName: 'Eska Gorąca',
  minEntries: 25,
  enabled: true,
};

let dir: string;
let chartsPath: string;
let overridesPath: string;
let db: Db;
let html: string;
let originalFetch: typeof globalThis.fetch;
let postedUris: string[][];
let playlistCalls: string[];

const fakeNow = (): Date => new Date('2026-09-04T12:00:00.000Z');

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Answers a Spotify track search with the queried artist and title, so every
 * parsed entry resolves to a distinct track and the written order is
 * observable. */
const echoedSearchHit = (searchUrl: string): Response => {
  const q = new URL(searchUrl).searchParams.get('q') ?? '';
  const parsed = /^artist:(.*) track:(.*)$/.exec(q);
  if (parsed === null) return jsonResponse({ tracks: { items: [] } });
  const title = parsed[2] ?? '';
  const id = Buffer.from(title).toString('hex').padEnd(22, '0').slice(0, 22);
  return jsonResponse({
    tracks: {
      items: [{ id, name: title, artists: [{ name: parsed[1] ?? '' }], duration_ms: 200_000 }],
    },
  });
};

interface FetchStubOptions {
  page?: () => Response;
  search?: 'match' | 'none';
  playlistExists?: boolean;
  unresolvable?: string[];
}

const installFetch = (options: FetchStubOptions = {}): void => {
  const {
    page = (): Response => new Response(html, { status: 200 }),
    search = 'match',
    playlistExists = true,
    unresolvable = [],
  } = options;
  postedUris = [];
  playlistCalls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const method = init?.method ?? 'GET';
    if (resolved.includes('/v1/me/playlists')) {
      return jsonResponse({
        items: playlistExists ? [{ id: 'PID', name: CHART.playlistName }] : [],
        next: null,
      });
    }
    if (resolved.includes('/v1/search')) {
      if (search === 'none') return jsonResponse({ tracks: { items: [] } });
      const q = new URL(resolved).searchParams.get('q') ?? '';
      if (unresolvable.some((t) => q.includes(t))) return jsonResponse({ tracks: { items: [] } });
      return echoedSearchHit(resolved);
    }
    if (resolved.includes('/v1/playlists/')) {
      playlistCalls.push(method);
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { uris?: string[] };
        postedUris.push(body.uris ?? []);
      }
      return jsonResponse({ snapshot_id: 'snap' });
    }
    return page();
  }) as typeof globalThis.fetch;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-chart-'));
  chartsPath = join(dir, 'charts.json');
  overridesPath = join(dir, 'overrides.json');
  writeFileSync(chartsPath, JSON.stringify([CHART]));
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  html = readFileSync(FIXTURE_PATH, 'utf-8');
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

const run = () =>
  runChart({
    chart: CHART.id,
    db,
    chartsPath,
    overridesPath,
    accessToken: 'token',
    now: fakeNow,
  });

describe('runChart', () => {
  test('writes the resolved tracks in chart order, chart before proposals', async () => {
    installFetch();

    const outcome = await run();

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.entriesParsed).toBe(45);
      expect(outcome.tracksWritten).toBe(45);
    }

    expect(playlistCalls).toContain('PUT');
    expect(postedUris).toHaveLength(1);
    const written = postedUris[0] ?? [];
    expect(written).toHaveLength(45);

    const idFor = (title: string): string =>
      `spotify:track:${Buffer.from(title).toString('hex').padEnd(22, '0').slice(0, 22)}`;
    expect(written[0]).toBe(idFor("My Body Isn't Ready"));
    expect(written[1]).toBe(idFor('Ty Masz'));
    expect(written[19]).toBe(idFor('Fate'));
    expect(written[20]).toBe(idFor('Emerald Eyes'));
  });

  test('skips an unresolvable entry and keeps the relative order', async () => {
    installFetch({ unresolvable: ["My Body Isn't Ready"] });

    const outcome = await run();

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.entriesParsed).toBe(45);
      expect(outcome.tracksWritten).toBe(44);
    }
    const written = postedUris[0] ?? [];
    const idFor = (title: string): string =>
      `spotify:track:${Buffer.from(title).toString('hex').padEnd(22, '0').slice(0, 22)}`;
    expect(written[0]).toBe(idFor('Ty Masz'));
    expect(written[18]).toBe(idFor('Fate'));
  });

  test('leaves the playlist untouched when the parse falls below minEntries', async () => {
    installFetch({
      page: (): Response =>
        new Response('<html><body><p>redesigned</p></body></html>', { status: 200 }),
    });

    const outcome = await run();

    expect(outcome.kind).toBe('implausible');
    expect(playlistCalls).toEqual([]);
    expect(syncRunsRepo.lastSuccess(db, CHART.id)).toBeUndefined();
  });

  test('leaves the playlist untouched when nothing resolves', async () => {
    installFetch({ search: 'none' });

    const outcome = await run();

    expect(outcome.kind).toBe('no_songs');
    expect(playlistCalls).toEqual([]);
  });

  test('leaves the playlist untouched when the page request fails', async () => {
    installFetch({ page: (): Response => new Response('boom', { status: 500 }) });

    await expect(run()).rejects.toThrow();
    expect(playlistCalls).toEqual([]);
  });

  test('reports the playlist as missing without writing anything', async () => {
    installFetch({ playlistExists: false });

    const outcome = await run();

    expect(outcome.kind).toBe('playlist_not_found');
    if (outcome.kind === 'playlist_not_found') expect(outcome.name).toBe(CHART.playlistName);
    expect(playlistCalls).toEqual([]);
  });

  test('reports blocked when a run is already in flight', async () => {
    syncRunsRepo.open(db, { station: CHART.id, startedAt: '2026-09-04T11:59:00.000Z' });
    installFetch();

    const outcome = await run();

    expect(outcome.kind).toBe('blocked');
    expect(playlistCalls).toEqual([]);
  });

  test('skips a disabled chart', async () => {
    writeFileSync(chartsPath, JSON.stringify([{ ...CHART, enabled: false }]));
    installFetch();

    const outcome = await run();

    expect(outcome.kind).toBe('disabled');
    expect(playlistCalls).toEqual([]);
  });

  test('reports an unknown chart id', async () => {
    writeFileSync(chartsPath, JSON.stringify([]));
    installFetch();

    const outcome = await run();

    expect(outcome.kind).toBe('not_found');
  });
});
