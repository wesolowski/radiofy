import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema.ts';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export const openDb = (path = 'storage/db/radiofy.db'): Db => {
  const sqlite = new Database(path);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA journal_mode = WAL;');
  return drizzle(sqlite, { schema });
};

export const openInMemoryDb = (): Db => {
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  return drizzle(sqlite, { schema });
};

export const applyMigrations = (
  db: Db,
  migrationsFolder = 'packages/database/migrations',
): void => {
  migrate(db, { migrationsFolder });
};
