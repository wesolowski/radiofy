import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StoredAuth {
  refresh_token: string;
  scopes: string[];
  obtained_at: string;
  client_id_hint: string;
}

const DEFAULT_PATH = 'storage/auth/spotify.json';

export const readAuth = (path: string = DEFAULT_PATH): StoredAuth | null => {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
};

export const writeAuth = (auth: StoredAuth, path: string = DEFAULT_PATH): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(auth, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
};

export const authPath = (): string => DEFAULT_PATH;
