import { describe, expect, test } from 'bun:test';
import { parseStationArgs } from '../lib/cli-args.ts';

describe('parseStationArgs', () => {
  test('parses --station=<id>', () => {
    expect(parseStationArgs(['--station=radio-zet'])).toEqual({ station: 'radio-zet' });
  });

  test('throws when --station is missing', () => {
    expect(() => parseStationArgs([])).toThrow(/--station/);
  });

  test('with allowAllStations=true, missing --station returns no station', () => {
    expect(parseStationArgs([], { allowAllStations: true })).toEqual({});
  });

  test('with allowAllStations=true, --station is still honored', () => {
    expect(parseStationArgs(['--station=radio-zet'], { allowAllStations: true })).toEqual({
      station: 'radio-zet',
    });
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

  test('with allowDays=true, --days=7 is parsed as number', () => {
    expect(parseStationArgs(['--station=radio-zet', '--days=7'], { allowDays: true })).toEqual({
      station: 'radio-zet',
      days: 7,
    });
  });

  test('with allowDays=true, non-integer --days throws', () => {
    expect(() =>
      parseStationArgs(['--station=radio-zet', '--days=abc'], { allowDays: true }),
    ).toThrow(/positive integer/);
    expect(() =>
      parseStationArgs(['--station=radio-zet', '--days=0'], { allowDays: true }),
    ).toThrow(/positive integer/);
    expect(() =>
      parseStationArgs(['--station=radio-zet', '--days=32'], { allowDays: true }),
    ).toThrow(/positive integer/);
  });

  test('without allowDays, --days is silently ignored', () => {
    expect(parseStationArgs(['--station=radio-zet', '--days=7'])).toEqual({
      station: 'radio-zet',
    });
  });
});
