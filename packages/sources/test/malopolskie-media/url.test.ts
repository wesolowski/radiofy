import { describe, expect, test } from 'bun:test';
import { buildUrl } from '../../src/malopolskie-media/url.ts';

describe('buildUrl', () => {
  test('full-day default returns the canonical 0/24 URL', () => {
    expect(buildUrl('radio-zet', '2026-05-24')).toBe(
      'https://malopolskie-media.info/playlista/radio-zet/2026-05-24/0/24.html',
    );
  });

  test('custom hour range', () => {
    expect(buildUrl('rmf-fm', '2026-05-24', 6, 12)).toBe(
      'https://malopolskie-media.info/playlista/rmf-fm/2026-05-24/6/12.html',
    );
  });

  test('different station slug', () => {
    expect(buildUrl('rmf-maxx', '2026-01-01')).toBe(
      'https://malopolskie-media.info/playlista/rmf-maxx/2026-01-01/0/24.html',
    );
  });
});
