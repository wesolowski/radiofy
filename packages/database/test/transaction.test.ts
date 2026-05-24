import { beforeEach, describe, expect, test } from 'bun:test';
import { type Db, applyMigrations, openInMemoryDb } from '../src/db.ts';
import { songs } from '../src/schema.ts';
import { withTransaction } from '../src/transaction.ts';

let db: Db;

beforeEach(() => {
  db = openInMemoryDb();
  applyMigrations(db, 'packages/database/migrations');
});

describe('withTransaction', () => {
  test('commits when the function returns normally', () => {
    withTransaction(db, (tx) => {
      tx.insert(songs)
        .values({
          normalizedKey: 'committed|song',
          primaryArtist: 'Committed',
          allArtists: 'Committed',
          title: 'Song',
        })
        .run();
    });
    const all = db.select().from(songs).all();
    expect(all).toHaveLength(1);
  });

  test('rolls back when the function throws', () => {
    expect(() =>
      withTransaction(db, (tx) => {
        tx.insert(songs)
          .values({
            normalizedKey: 'rolled-back|song',
            primaryArtist: 'Rolled',
            allArtists: 'Rolled',
            title: 'Back',
          })
          .run();
        throw new Error('boom');
      }),
    ).toThrow(/boom/);
    const all = db.select().from(songs).all();
    expect(all).toHaveLength(0);
  });
});
