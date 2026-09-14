import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Db,
  applyMigrations,
  openInMemoryDb,
  playsRepo,
  songsRepo,
  syncRunsRepo,
  unmatchedRepo,
} from '@radiofy/database';
import { buildReport, renderReport, runReport } from '../lib/report.ts';

const STATION = {
  id: 'zet',
  name: 'ZET',
  source: 'odsluchane-eu',
  sourceSlug: '1',
  playlistName: 'Radio Zet Weekly Playlist',
  enabled: true,
};

const CHART = {
  id: 'eska-goraca20',
  name: 'Eska Gorąca 20',
  source: 'eska-goraca20',
  url: 'https://www.eska.pl/goraca20/',
  playlistName: 'Eska Gorąca',
  minEntries: 20,
  enabled: true,
};

let dir: string;
let stationsPath: string;
let chartsPath: string;
let db: Db;

const fakeNow = (): Date => new Date('2026-05-26T12:00:00.000Z');

const seedPlays = (title: string, artist: string, times: number, playedAt: string): void => {
  const song = songsRepo.upsertByNormalizedKey(db, {
    normalizedKey: `${artist.toLowerCase()}|${title.toLowerCase()}`,
    primaryArtist: artist,
    allArtists: artist,
    title,
  });
  for (let i = 0; i < times; i++) {
    playsRepo.insert(db, {
      source: 'odsluchane-eu',
      sourceTrackId: `${song.id}-${i}`,
      station: STATION.id,
      songId: song.id,
      playedAt,
      crawledAt: playedAt,
    });
  }
};

const options = (): Parameters<typeof buildReport>[0] => ({
  db,
  stationsPath,
  chartsPath,
  now: fakeNow,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-report-'));
  stationsPath = join(dir, 'stations.json');
  chartsPath = join(dir, 'charts.json');
  writeFileSync(stationsPath, JSON.stringify([STATION]));
  writeFileSync(chartsPath, JSON.stringify([CHART]));
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buildReport', () => {
  test('ranks the week by play count and says when the playlist was updated', () => {
    seedPlays('Nareszcie', 'Męskie Granie', 5, '2026-05-24T10:00:00.000Z');
    seedPlays('New Religion', 'Bebe Rexha', 2, '2026-05-24T11:00:00.000Z');
    const run = syncRunsRepo.open(db, {
      station: STATION.id,
      startedAt: '2026-05-25T04:00:00.000Z',
    });
    syncRunsRepo.close(db, run.id, '2026-05-25T04:00:30.000Z', 412, null);

    const model = buildReport(options());
    const station = model.stations[0];

    expect(station?.songs.map((s) => [s.rank, s.title, s.plays])).toEqual([
      [1, 'Nareszcie', 5],
      [2, 'New Religion', 2],
    ]);
    expect(station?.lastUpdatedAt).toBe('2026-05-25T04:00:30.000Z');
    expect(station?.tracksWritten).toBe(412);
  });

  test('leaves out plays that fell out of the week', () => {
    seedPlays('Old News', 'Someone', 9, '2026-04-01T10:00:00.000Z');

    expect(buildReport(options()).stations[0]?.songs).toEqual([]);
  });

  test('reports chart runs newest first, failures included', () => {
    const ok = syncRunsRepo.open(db, { station: CHART.id, startedAt: '2026-05-20T09:00:00.000Z' });
    syncRunsRepo.close(db, ok.id, '2026-05-20T09:00:04.000Z', 48, null, 48);
    const bad = syncRunsRepo.open(db, { station: CHART.id, startedAt: '2026-05-25T09:00:00.000Z' });
    syncRunsRepo.close(db, bad.id, '2026-05-25T09:00:04.000Z', null, 'playlist not found');

    const chart = buildReport(options()).charts[0];

    expect(chart?.runs.map((r) => r.error)).toEqual(['playlist not found', null]);
    expect(chart?.runs.map((r) => r.entriesSeen)).toEqual([null, 48]);
    expect(chart?.lastUpdatedAt).toBe('2026-05-20T09:00:04.000Z');
    expect(chart?.tracksWritten).toBe(48);
  });

  test('hides unmatched songs belonging to a station that is no longer configured', () => {
    const seen = '2026-05-24T10:00:00.000Z';
    unmatchedRepo.upsertOccurrence(db, {
      normalizedKey: 'years and years|king',
      artist: 'Years & Years',
      title: 'King',
      source: 'odsluchane-eu',
      station: 'radio-zet',
      firstSeenAt: seen,
      lastSeenAt: seen,
      reason: 'no_results',
    });
    unmatchedRepo.upsertOccurrence(db, {
      normalizedKey: 'tabb|dach',
      artist: 'Tabb',
      title: 'Dach',
      source: 'odsluchane-eu',
      station: STATION.id,
      firstSeenAt: seen,
      lastSeenAt: seen,
      reason: 'no_results',
    });

    const rows = buildReport(options()).unmatched;

    expect(rows.map((r) => r.title)).toEqual(['Dach']);
  });

  test('skips a disabled station', () => {
    writeFileSync(stationsPath, JSON.stringify([{ ...STATION, enabled: false }]));

    expect(buildReport(options()).stations).toEqual([]);
  });
});

describe('renderReport', () => {
  test('pulls in nothing from the network', () => {
    const html = renderReport(buildReport(options()));

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/[^"']*\.(?:css|js|woff2?)/i);
    expect(html).not.toMatch(/<link[^>]+href/i);
  });

  test('says so instead of drawing an empty chart of plays', () => {
    expect(renderReport(buildReport(options()))).toContain('No plays collected');
  });

  test('escapes song text rather than letting it into the markup', () => {
    seedPlays('<script>alert(1)</script>', 'Someone & Co', 1, '2026-05-24T10:00:00.000Z');

    const html = renderReport(buildReport(options()));

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Someone &amp; Co');
    expect(html).not.toContain('<script>alert');
  });
});

describe('renderReport: chart result', () => {
  const runChartWith = (entriesSeen: number, tracksWritten: number): string => {
    const run = syncRunsRepo.open(db, {
      station: CHART.id,
      startedAt: '2026-05-25T09:00:00.000Z',
    });
    syncRunsRepo.close(db, run.id, '2026-05-25T09:00:04.000Z', tracksWritten, null, entriesSeen);
    return renderReport(buildReport(options()));
  };

  test('says every song was found when the counts match', () => {
    expect(runChartWith(48, 48)).toContain('all found on Spotify');
  });

  test('names how many were missed when they do not', () => {
    expect(runChartWith(48, 45)).toContain('3 not found on Spotify');
  });
});

describe('renderReport: freshness', () => {
  const dotsIn = (html: string): string[] =>
    [...html.matchAll(/<span class="dot([^"]*)"/g)].map((m) => m[1]?.trim() ?? '');

  test('marks a playlist that has not been updated in over a day and a half', () => {
    const run = syncRunsRepo.open(db, {
      station: STATION.id,
      startedAt: '2026-05-20T04:00:00.000Z',
    });
    syncRunsRepo.close(db, run.id, '2026-05-20T04:00:30.000Z', 400, null);

    expect(dotsIn(renderReport(buildReport(options())))).toContain('bad');
  });

  test('leaves a recently updated playlist unmarked', () => {
    const run = syncRunsRepo.open(db, {
      station: STATION.id,
      startedAt: '2026-05-26T04:00:00.000Z',
    });
    syncRunsRepo.close(db, run.id, '2026-05-26T04:00:30.000Z', 400, null);

    const dots = dotsIn(renderReport(buildReport(options())));
    expect(dots.filter((d) => d === '')).toHaveLength(1);
  });
});

describe('runReport', () => {
  test('writes the file and hands back where it went', () => {
    const outPath = join(dir, 'nested', 'report.html');

    const { path } = runReport({ ...options(), outPath });

    expect(path).toBe(outPath);
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, 'utf-8')).toContain('Radiofy report');
  });
});
