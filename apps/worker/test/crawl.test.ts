import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Db,
  applyMigrations,
  crawlRuns,
  crawlRunsRepo,
  openInMemoryDb,
  playsRepo,
} from '@radiofy/database';
import { runCrawl } from '../lib/crawl.ts';

const FIXTURE_PATH = 'packages/sources/test/malopolskie-media/fixtures/radio-zet-2026-05-24.html';

let dir: string;
let stationsPath: string;
let db: Db;
let html: string;

const enabledStation = [
  {
    id: 'radio-zet',
    name: 'ZET',
    source: 'malopolskie-media',
    sourceSlug: 'radio-zet',
    playlistName: 'Radio Zet Weekly Playlist',
    enabled: true,
  },
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-crawl-'));
  stationsPath = join(dir, 'stations.json');
  writeFileSync(stationsPath, JSON.stringify(enabledStation));
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  html = readFileSync(FIXTURE_PATH, 'utf-8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const stubFetch = (body: string, status = 200): typeof globalThis.fetch =>
  (async () => new Response(body, { status })) as unknown as typeof globalThis.fetch;

describe('runCrawl', () => {
  test('happy path inserts plays for every parseable song and closes the audit row', async () => {
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.songsSeen).toBeGreaterThanOrEqual(100);
      expect(outcome.inserted).toBeGreaterThanOrEqual(100);
    }

    const count = playsRepo.countByStationInWindow(
      db,
      'radio-zet',
      '2026-05-22T00:00:00.000Z',
      '2026-05-26T00:00:00.000Z',
    );
    expect(count).toBeGreaterThanOrEqual(100);
  });

  test('re-running the same crawl is idempotent (no duplicate plays)', async () => {
    await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
    });
    const firstCount = playsRepo.countByStationInWindow(
      db,
      'radio-zet',
      '2026-05-22T00:00:00.000Z',
      '2026-05-26T00:00:00.000Z',
    );
    await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
    });
    const secondCount = playsRepo.countByStationInWindow(
      db,
      'radio-zet',
      '2026-05-22T00:00:00.000Z',
      '2026-05-26T00:00:00.000Z',
    );
    expect(secondCount).toBe(firstCount);
  });

  test('opens and closes a crawl_runs row for every invocation', async () => {
    await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
    });
    await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
    });
    const stuck = crawlRunsRepo.findStuckOlderThan(db, '9999-12-31T00:00:00.000Z');
    expect(stuck).toEqual([]);
  });

  test('returns not_found when the station id is not in config', async () => {
    expect(
      (
        await runCrawl({
          station: 'missing',
          day: '2026-05-24',
          db,
          stationsPath,
          fetchFn: stubFetch(html),
        })
      ).kind,
    ).toBe('not_found');
  });

  test('returns disabled for an enabled=false station and does not fetch', async () => {
    writeFileSync(stationsPath, JSON.stringify([{ ...enabledStation[0], enabled: false }]));
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return new Response('');
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn,
    });
    expect(outcome.kind).toBe('disabled');
    expect(called).toBe(false);
  });

  test('blocks a concurrent crawl_run within the overlap cutoff', async () => {
    const fakeNow = new Date('2026-05-25T03:00:00.000Z');
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-24',
      startedAt: '2026-05-25T02:59:00.000Z',
    });
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
      now: (): Date => fakeNow,
    });
    expect(outcome.kind).toBe('blocked');
  });

  test('overrides a crashed crawl_run older than the cutoff', async () => {
    const fakeNow = new Date('2026-05-25T05:00:00.000Z');
    crawlRunsRepo.open(db, {
      station: 'radio-zet',
      day: '2026-05-24',
      startedAt: '2026-05-25T03:00:00.000Z',
    });
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
      now: (): Date => fakeNow,
    });
    expect(outcome.kind).toBe('ok');
  });

  test('a day that keeps 5xx-ing is retried, closed with the error, and isolated', async () => {
    let calls = 0;
    const failFetch = (async () => {
      calls++;
      return new Response('boom', { status: 503 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: failFetch,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.daysFailed).toBe(1);
      expect(outcome.songsSeen).toBe(0);
      expect(outcome.inserted).toBe(0);
    }
    expect(calls).toBe(3);
    const stuck = crawlRunsRepo.findStuckOlderThan(db, '9999-12-31T00:00:00.000Z');
    expect(stuck).toEqual([]);
  });

  test('retries a transient 5xx and recovers', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 500 });
      return new Response(html, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.daysFailed).toBe(0);
      expect(outcome.inserted).toBeGreaterThan(0);
    }
    expect(calls).toBe(2);
  });

  test('retries a 5xx twice before a 200 and still recovers', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      if (calls <= 2) return new Response('', { status: 500 });
      return new Response(html, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.daysFailed).toBe(0);
      expect(outcome.inserted).toBeGreaterThan(0);
    }
    expect(calls).toBe(3);
  });

  test('retries a thrown network error and recovers', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      if (calls === 1) throw new Error('ECONNRESET');
      return new Response(html, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.daysFailed).toBe(0);
    expect(calls).toBe(2);
  });

  test('aborts a request that never answers and fails only that day', async () => {
    let calls = 0;
    const hangingFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    }) as unknown as typeof globalThis.fetch;

    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: hangingFetch,
      timeoutMs: 40,
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.daysFailed).toBe(1);
    expect(calls).toBe(3);
    const stuck = crawlRunsRepo.findStuckOlderThan(db, '9999-12-31T00:00:00.000Z');
    expect(stuck).toEqual([]);

    const [run] = db.select().from(crawlRuns).all();
    expect(run?.error).toMatch(/no answer within 40ms from https?:\/\//);
  });

  test('aborts and retries when the headers arrive but the body stalls', async () => {
    let calls = 0;
    const stalledBody = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html><table class="table">'));
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
        },
      });
      return new Response(stream, { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stalledBody,
      timeoutMs: 40,
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.daysFailed).toBe(1);
    expect(calls).toBe(3);
    const [run] = db.select().from(crawlRuns).all();
    expect(run?.error).toMatch(/no answer within 40ms/);
  });

  test('a request answering within the deadline is unaffected', async () => {
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn: stubFetch(html),
      timeoutMs: 5_000,
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.daysFailed).toBe(0);
      expect(outcome.inserted).toBeGreaterThan(0);
    }
  });

  test('does not retry a 4xx response', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response('', { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      day: '2026-05-24',
      db,
      stationsPath,
      fetchFn,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.daysFailed).toBe(1);
    expect(calls).toBe(1);
  });

  test('a failing day does not abort the rest of the range', async () => {
    const fakeNow = new Date('2026-05-26T12:00:00.000Z');
    const fetchFn = (async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (u.includes('2026-05-24')) return new Response('', { status: 500 });
      return new Response(html, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      days: 2,
      db,
      stationsPath,
      fetchFn,
      now: (): Date => fakeNow,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.daysCrawled).toBe(2);
      expect(outcome.daysFailed).toBe(1);
      expect(outcome.inserted).toBeGreaterThan(0);
    }
  });

  test('--days=3 opens three crawl_runs rows for the three days before yesterday', async () => {
    const fakeNow = new Date('2026-05-26T12:00:00.000Z');
    const seenDays: string[] = [];
    const fetchFn = (async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      const dayMatch = u.match(/\/(\d{4}-\d{2}-\d{2})\//);
      if (dayMatch?.[1] !== undefined) seenDays.push(dayMatch[1]);
      return new Response(html, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      days: 3,
      db,
      stationsPath,
      fetchFn,
      now: (): Date => fakeNow,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.daysCrawled).toBe(3);
    const distinctDays = new Set(seenDays);
    expect(distinctDays.size).toBe(3);
    expect(distinctDays.has('2026-05-25')).toBe(true);
    expect(distinctDays.has('2026-05-24')).toBe(true);
    expect(distinctDays.has('2026-05-23')).toBe(true);
  });

  test('--days=1 crawls yesterday only', async () => {
    const fakeNow = new Date('2026-05-26T12:00:00.000Z');
    const fetchFn = (async () =>
      new Response(html, { status: 200 })) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      days: 1,
      db,
      stationsPath,
      fetchFn,
      now: (): Date => fakeNow,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.daysCrawled).toBe(1);
  });

  test('without day/days, defaults to the 7 days ending yesterday', async () => {
    const fakeNow = new Date('2026-05-26T12:00:00.000Z');
    const seenDays: string[] = [];
    const fetchFn = (async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      const dayMatch = u.match(/\/(\d{4}-\d{2}-\d{2})\//);
      if (dayMatch?.[1] !== undefined) seenDays.push(dayMatch[1]);
      return new Response(html, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const outcome = await runCrawl({
      station: 'radio-zet',
      db,
      stationsPath,
      fetchFn,
      now: (): Date => fakeNow,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.daysCrawled).toBe(7);
    const distinctDays = new Set(seenDays);
    expect(distinctDays.size).toBe(7);
    expect(distinctDays.has('2026-05-25')).toBe(true);
    expect(distinctDays.has('2026-05-19')).toBe(true);
  });
});
