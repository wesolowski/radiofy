import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../../sources/src/malopolskie-media/parse.ts';
import { normalize } from '../src/normalize.ts';

const fixturePath = join(
  import.meta.dir,
  '..',
  '..',
  'sources',
  'test',
  'malopolskie-media',
  'fixtures',
  'radio-zet-2026-05-24.html',
);

describe('normalizer + parser on real ZET 2026-05-24 fixture', () => {
  test('produces fewer unique normalized keys than total songs (dedup happens)', () => {
    const html = readFileSync(fixturePath, 'utf-8');
    const songs = parse({ html, station: 'radio-zet', day: '2026-05-24' });
    expect(songs.length).toBeGreaterThanOrEqual(100);

    const keys = new Set(songs.map((s) => normalize(s).normalizedKey));
    expect(keys.size).toBeLessThan(songs.length);
  });
});
