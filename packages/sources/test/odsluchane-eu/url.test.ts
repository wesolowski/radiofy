import { describe, expect, test } from 'bun:test';
import { ODSLUCHANE_EU_STATIONS, dayUrls } from '../../src/odsluchane-eu/index.ts';
import { buildUrl } from '../../src/odsluchane-eu/url.ts';

describe('buildUrl', () => {
  test('converts YYYY-MM-DD to DD-MM-YYYY and includes the station id', () => {
    expect(buildUrl('1', '2026-05-25', 0, 5)).toBe(
      'https://www.odsluchane.eu/szukaj.php?r=1&date=25-05-2026&time_from=0&time_to=5',
    );
  });

  test('encodes a custom hour range', () => {
    expect(buildUrl('2', '2026-05-25', 8, 12)).toBe(
      'https://www.odsluchane.eu/szukaj.php?r=2&date=25-05-2026&time_from=8&time_to=12',
    );
  });

  test('rejects a malformed date', () => {
    expect(() => buildUrl('1', '25/05/2026')).toThrow(/YYYY-MM-DD/);
  });
});

describe('dayUrls — full-day chunking', () => {
  test('returns three windows that cover the full day with time_to=0 as end marker', () => {
    const urls = dayUrls('1', '2026-05-25');
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('time_from=0&time_to=10');
    expect(urls[1]).toContain('time_from=10&time_to=20');
    expect(urls[2]).toContain('time_from=20&time_to=0');
  });
});

describe('ODSLUCHANE_EU_STATIONS map', () => {
  test('covers the four MVP stations', () => {
    expect(ODSLUCHANE_EU_STATIONS['radio-zet']).toBe('1');
    expect(ODSLUCHANE_EU_STATIONS['rmf-fm']).toBe('2');
    expect(ODSLUCHANE_EU_STATIONS['radio-eska']).toBe('3');
    expect(ODSLUCHANE_EU_STATIONS['rmf-maxx']).toBe('4');
  });
});
