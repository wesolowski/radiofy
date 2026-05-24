import type { Db } from './db.ts';

export const withTransaction = <T>(db: Db, fn: (tx: Db) => T): T =>
  db.transaction((tx) => fn(tx as unknown as Db));
