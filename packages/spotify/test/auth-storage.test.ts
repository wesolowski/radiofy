import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type StoredAuth, readAuth, writeAuth } from '../src/auth-storage.ts';

let dir: string;
let path: string;

const sample: StoredAuth = {
  refresh_token: 'AQDxyz...',
  scopes: ['playlist-modify-public', 'playlist-modify-private'],
  obtained_at: '2026-05-25T10:00:00.000Z',
  client_id_hint: 'ab12',
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-auth-'));
  path = join(dir, 'spotify.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeAuth / readAuth', () => {
  test('round-trips the stored auth blob', () => {
    writeAuth(sample, path);
    expect(readAuth(path)).toEqual(sample);
  });

  test('file mode after write is 0600 (rw for owner only)', () => {
    writeAuth(sample, path);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test('creates missing parent directories', () => {
    const nested = join(dir, 'a', 'b', 'c', 'spotify.json');
    writeAuth(sample, nested);
    expect(readAuth(nested)).toEqual(sample);
  });

  test('readAuth returns null when the file does not exist', () => {
    expect(readAuth(join(dir, 'missing.json'))).toBeNull();
  });

  test('the persisted JSON does not contain the client secret anywhere', () => {
    writeAuth(sample, path);
    const raw = Bun.file(path);
    const text = require('node:fs').readFileSync(path, 'utf-8') as string;
    expect(text).not.toMatch(/secret/i);
    expect(raw).toBeDefined();
  });
});
