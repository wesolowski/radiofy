import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Db, applyMigrations, openInMemoryDb, syncRunsRepo } from '@radiofy/database';
import { asciiFold } from '@radiofy/normalizer';
import { parseChart } from '@radiofy/sources';
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

/**
 * Mirrors the id the echoed search stub returns. The lookup folds diacritics
 * before querying, so the stub echoes the folded title back.
 */
const idFor = (title: string): string =>
  `spotify:track:${Buffer.from(asciiFold(title)).toString('hex').padEnd(22, '0').slice(0, 22)}`;

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
  searchFails?: string[];
}

const installFetch = (options: FetchStubOptions = {}): void => {
  const {
    page = (): Response => new Response(html, { status: 200 }),
    search = 'match',
    playlistExists = true,
    unresolvable = [],
    searchFails = [],
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
      if (searchFails.some((t) => q.includes(t))) return jsonResponse({}, 500);
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

const runWith = (overrides: Partial<typeof CHART>) => {
  writeFileSync(chartsPath, JSON.stringify([{ ...CHART, ...overrides }]));
  return runChart({
    chart: CHART.id,
    db,
    chartsPath,
    overridesPath,
    accessToken: 'token',
    now: fakeNow,
  });
};

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

    const expected = parseChart({ html }).map((e) => idFor(e.title));
    expect(written).toEqual(expected);
    expect(written[0]).toBe(idFor("My Body Isn't Ready"));
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

  test('leaves the playlist untouched when the page never answers', async () => {
    installFetch();
    const withPage = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const resolved = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (resolved.startsWith(CHART.url)) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        });
      }
      return withPage(url, init);
    }) as typeof globalThis.fetch;

    await expect(
      runChart({
        chart: CHART.id,
        db,
        chartsPath,
        overridesPath,
        accessToken: 'token',
        now: fakeNow,
        timeoutMs: 40,
      }),
    ).rejects.toThrow(/40ms/);
    expect(playlistCalls).toEqual([]);
  });

  test('leaves the playlist untouched when the page body stalls mid-transfer', async () => {
    installFetch();
    const withPage = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const resolved = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (resolved.startsWith(CHART.url)) {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<div class="single-hit">'));
            init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
          },
        });
        return new Response(stream, { status: 200 });
      }
      return withPage(url, init);
    }) as typeof globalThis.fetch;

    await expect(
      runChart({
        chart: CHART.id,
        db,
        chartsPath,
        overridesPath,
        accessToken: 'token',
        now: fakeNow,
        timeoutMs: 40,
      }),
    ).rejects.toThrow(/40ms/);
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

  test('leaves the playlist untouched when a Spotify lookup fails outright', async () => {
    installFetch({ searchFails: ["My Body Isn't Ready"] });

    const outcome = await run();

    expect(outcome.kind).toBe('degraded');
    if (outcome.kind === 'degraded') {
      expect(outcome.apiErrors).toBe(1);
      expect(outcome.entriesParsed).toBe(45);
    }
    expect(playlistCalls).toEqual([]);
    expect(syncRunsRepo.lastSuccess(db, CHART.id)).toBeUndefined();
  });

  test('accepts a parse exactly at minEntries and rejects one entry short', async () => {
    installFetch();
    const atFloor = await runWith({ minEntries: 45 });
    expect(atFloor.kind).toBe('ok');

    postedUris = [];
    playlistCalls = [];
    syncRunsRepo.close(db, 1, '2026-09-04T12:00:00.000Z', 45, null);
    const belowFloor = await runWith({ minEntries: 46 });
    expect(belowFloor.kind).toBe('implausible');
    if (belowFloor.kind === 'implausible') {
      expect(belowFloor.entriesParsed).toBe(45);
      expect(belowFloor.minEntries).toBe(46);
    }
    expect(playlistCalls).toEqual([]);
  });

  test('writes a track colliding across sections only once, keeping its first position', async () => {
    const twin = `
      <div class="single-hit">
        <div class="single-hit__positions"><div class="single-hit__position">1</div></div>
        <div class="single-hit__info">
          <a href="/hit/a-so-AAAA-AAAA-AAAA.html" class="single-hit__title">Twin Song</a>
          <ul><li><a href="/hit/a-so-AAAA-AAAA-AAAA.html" class="single-hit__author">Artist One</a></li></ul>
        </div>
      </div>
      <div class="single-hit">
        <div class="single-hit__info">
          <a href="/hit/b-so-BBBB-BBBB-BBBB.html" class="single-hit__title">Twin Song</a>
          <ul><li><a href="/hit/b-so-BBBB-BBBB-BBBB.html" class="single-hit__author">Artist One</a></li></ul>
        </div>
      </div>`;
    installFetch({ page: (): Response => new Response(twin, { status: 200 }) });

    const outcome = await runWith({ minEntries: 2 });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.entriesParsed).toBe(2);
      expect(outcome.tracksWritten).toBe(1);
    }
    expect(postedUris[0]).toEqual([idFor('Twin Song')]);
  });

  test('reports an unknown chart id', async () => {
    writeFileSync(chartsPath, JSON.stringify([]));
    installFetch();

    const outcome = await run();

    expect(outcome.kind).toBe('not_found');
  });
});
