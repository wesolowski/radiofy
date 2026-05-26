import { describe, expect, test } from 'bun:test';
import { parseStationArgs } from '../lib/cli-args.ts';

describe('parseStationArgs', () => {
  test('parses --station=<id>', () => {
    expect(parseStationArgs(['--station=radio-zet'])).toEqual({ station: 'radio-zet' });
  });

  test('throws when --station is missing', () => {
    expect(() => parseStationArgs([])).toThrow(/--station/);
  });

  test('with allowDay=false, --day is ignored', () => {
    expect(parseStationArgs(['--station=radio-zet', '--day=2026-05-24'])).toEqual({
      station: 'radio-zet',
    });
  });

  test('with allowDay=true, --day is included', () => {
    expect(
      parseStationArgs(['--station=radio-zet', '--day=2026-05-24'], { allowDay: true }),
    ).toEqual({ station: 'radio-zet', day: '2026-05-24' });
  });

  test('with allowDay=true, malformed --day throws', () => {
    expect(() =>
      parseStationArgs(['--station=radio-zet', '--day=24/05/2026'], { allowDay: true }),
    ).toThrow(/YYYY-MM-DD/);
  });
});
