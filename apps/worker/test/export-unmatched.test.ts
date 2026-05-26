import { beforeEach, describe, expect, test } from 'bun:test';
import { type Db, applyMigrations, openInMemoryDb, unmatchedRepo } from '@radiofy/database';
import { runExportUnmatched } from '../lib/export-unmatched.ts';

let db: Db;
let lines: string[];
const stdout = (line: string): void => {
  lines.push(line);
};

beforeEach(() => {
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
  lines = [];

  unmatchedRepo.upsertOccurrence(db, {
    normalizedKey: 'a|x',
    artist: 'A',
    title: 'X',
    source: 'malopolskie-media',
    sourceTrackId: '100',
    station: 'radio-zet',
    firstSeenAt: '2026-05-20T00:00:00.000Z',
    lastSeenAt: '2026-05-24T00:00:00.000Z',
    reason: 'no_results',
  });
  unmatchedRepo.upsertOccurrence(db, {
    normalizedKey: 'b|y',
    artist: 'B',
    title: 'Y',
    source: 'malopolskie-media',
    sourceTrackId: '200',
    station: 'rmf-fm',
    firstSeenAt: '2026-05-22T00:00:00.000Z',
    lastSeenAt: '2026-05-25T00:00:00.000Z',
    reason: 'low_confidence',
  });
  unmatchedRepo.upsertOccurrence(db, {
    normalizedKey: 'c|z',
    artist: 'C',
    title: 'Z',
    source: 'malopolskie-media',
    sourceTrackId: '300',
    station: 'radio-zet',
    firstSeenAt: '2026-05-23T00:00:00.000Z',
    lastSeenAt: '2026-05-25T00:00:00.000Z',
    reason: 'no_results',
  });
  unmatchedRepo.markResolved(db, 'c|z', '2026-05-25T01:00:00.000Z');
});

describe('runExportUnmatched', () => {
  test('writes header + 2 open rows by default (skips resolved)', () => {
    const count = runExportUnmatched({ db, stdout });
    expect(count).toBe(2);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.startsWith('normalized_key,')).toBe(true);
  });

  test('--all includes resolved rows', () => {
    const count = runExportUnmatched({ db, all: true, stdout });
    expect(count).toBe(3);
  });

  test('--station filters by station', () => {
    const count = runExportUnmatched({ db, station: 'rmf-fm', stdout });
    expect(count).toBe(1);
    expect(lines[1]).toContain('rmf-fm');
  });

  test('--since filters by first_seen_at', () => {
    const count = runExportUnmatched({ db, since: '2026-05-22', stdout });
    expect(count).toBe(1);
    expect(lines[1]).toContain('rmf-fm');
  });
});
