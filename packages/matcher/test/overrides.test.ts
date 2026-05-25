import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ResolveInput, loadOverrides } from '../src/overrides.ts';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-overrides-'));
  path = join(dir, 'overrides.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const writeFile = (contents: unknown): void => {
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2));
};

const validSpotify = 'spotify:track:0jXQrPLm0jKZTXdQRZzj1n';
const otherSpotify = 'spotify:track:1bDpRwjqf73jKr5fGyqW1n';

const resolveInput = (overrides: Partial<ResolveInput> = {}): ResolveInput => ({
  source: 'malopolskie-media',
  sourceTrackId: '86665',
  normalizedKey: 'komodo|i just died in your arms',
  primaryArtist: 'Komodo',
  title: '(I Just) Died In Your Arms',
  ...overrides,
});

describe('loadOverrides — missing file', () => {
  test('returns an empty table when the file does not exist', () => {
    const table = loadOverrides(join(dir, 'missing.json'));
    expect(table.size).toBe(0);
    expect(table.resolve(resolveInput())).toBeNull();
  });
});

describe('loadOverrides — invalid JSON', () => {
  test('throws with the file path', () => {
    writeFile('{ broken json');
    expect(() => loadOverrides(path)).toThrow(/not valid JSON/);
    expect(() => loadOverrides(path)).toThrow(path);
  });
});

describe('loadOverrides — schema validation', () => {
  test('rejects an empty match block', () => {
    writeFile({ overrides: [{ match: {}, spotify_id: validSpotify }] });
    expect(() => loadOverrides(path)).toThrow(/overrides\[0\]/);
  });

  test('rejects a malformed spotify_id', () => {
    writeFile({
      overrides: [{ match: { normalized_key: 'a|b' }, spotify_id: 'spotify:track:short' }],
    });
    expect(() => loadOverrides(path)).toThrow(/spotify_id/);
  });

  test('rejects entries with unknown discriminator', () => {
    writeFile({
      overrides: [{ match: { something_else: 'X' }, spotify_id: validSpotify }],
    });
    expect(() => loadOverrides(path)).toThrow();
  });
});

describe('loadOverrides — conflict detection', () => {
  test('throws on duplicate (source, source_track_id) with different spotify_id', () => {
    writeFile({
      overrides: [
        { match: { source: 'malopolskie-media', source_track_id: '1' }, spotify_id: validSpotify },
        { match: { source: 'malopolskie-media', source_track_id: '1' }, spotify_id: otherSpotify },
      ],
    });
    expect(() => loadOverrides(path)).toThrow(/conflict.*\[0,\s*1\]/);
  });

  test('accepts duplicate (source, source_track_id) with the same spotify_id', () => {
    writeFile({
      overrides: [
        { match: { source: 'malopolskie-media', source_track_id: '1' }, spotify_id: validSpotify },
        { match: { source: 'malopolskie-media', source_track_id: '1' }, spotify_id: validSpotify },
      ],
    });
    expect(() => loadOverrides(path)).not.toThrow();
  });

  test('throws on duplicate normalized_key with different spotify_id', () => {
    writeFile({
      overrides: [
        { match: { normalized_key: 'a|b' }, spotify_id: validSpotify },
        { match: { normalized_key: 'a|b' }, spotify_id: otherSpotify },
      ],
    });
    expect(() => loadOverrides(path)).toThrow(/normalized_key/);
  });

  test('throws on duplicate (artist, title) after re-normalization with different spotify_id', () => {
    writeFile({
      overrides: [
        { match: { artist: 'Kayah', title: 'Podatek Od Miłości' }, spotify_id: validSpotify },
        { match: { artist: 'kayah', title: 'podatek od milosci' }, spotify_id: otherSpotify },
      ],
    });
    expect(() => loadOverrides(path)).toThrow(/artist\/title/);
  });
});

describe('OverrideTable.resolve — priority order', () => {
  test('source/source_track_id beats normalized_key beats artist/title', () => {
    writeFile({
      overrides: [
        {
          match: { artist: 'Komodo', title: '(I Just) Died In Your Arms' },
          spotify_id: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',
        },
        {
          match: { normalized_key: 'komodo|(i just) died in your arms' },
          spotify_id: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb',
        },
        {
          match: { source: 'malopolskie-media', source_track_id: '86665' },
          spotify_id: 'spotify:track:cccccccccccccccccccccc',
        },
      ],
    });
    const table = loadOverrides(path);
    const resolved = table.resolve(
      resolveInput({ normalizedKey: 'komodo|(i just) died in your arms' }),
    );
    expect(resolved).toBe('spotify:track:cccccccccccccccccccccc');
  });

  test('falls back to normalized_key when source mode does not match', () => {
    writeFile({
      overrides: [
        {
          match: { normalized_key: 'komodo|(i just) died in your arms' },
          spotify_id: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb',
        },
      ],
    });
    const table = loadOverrides(path);
    const resolved = table.resolve(
      resolveInput({
        source: 'other',
        sourceTrackId: '999',
        normalizedKey: 'komodo|(i just) died in your arms',
      }),
    );
    expect(resolved).toBe('spotify:track:bbbbbbbbbbbbbbbbbbbbbb');
  });

  test('falls back to (artist, title) when nothing else matches', () => {
    writeFile({
      overrides: [
        {
          match: { artist: 'Komodo', title: '(I Just) Died In Your Arms' },
          spotify_id: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
    });
    const table = loadOverrides(path);
    const resolved = table.resolve(
      resolveInput({
        source: 'other',
        sourceTrackId: '999',
        normalizedKey: 'komodo|something else',
      }),
    );
    expect(resolved).toBe('spotify:track:aaaaaaaaaaaaaaaaaaaaaa');
  });

  test('returns null when nothing matches', () => {
    writeFile({ overrides: [] });
    const table = loadOverrides(path);
    expect(table.resolve(resolveInput())).toBeNull();
  });

  test('(artist, title) mode normalizes at load — Polish diacritics fold', () => {
    writeFile({
      overrides: [{ match: { artist: 'Hyży', title: 'Miłości' }, spotify_id: validSpotify }],
    });
    const table = loadOverrides(path);
    const resolved = table.resolve(
      resolveInput({
        source: 'other',
        sourceTrackId: '0',
        normalizedKey: 'mismatch|key',
        primaryArtist: 'Hyzy',
        title: 'Milosci',
      }),
    );
    expect(resolved).toBe(validSpotify);
  });
});

describe('loadOverrides — empty overrides array', () => {
  test('loads an empty overrides array without error', () => {
    writeFile({ overrides: [] });
    const table = loadOverrides(path);
    expect(table.size).toBe(0);
  });
});
