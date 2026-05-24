import { describe, expect, test } from 'bun:test';
import { rollingWeekWindow, toUtc } from '../src/date.ts';

describe('toUtc — Europe/Warsaw DST transitions', () => {
  test('before the spring forward jump (Mar 29 2026 01:30 local is UTC+1)', () => {
    const utc = toUtc('2026-03-29T01:30:00', 'Europe/Warsaw');
    expect(utc.toISOString()).toBe('2026-03-29T00:30:00.000Z');
  });

  test('after the spring forward jump (Mar 29 2026 03:30 local is UTC+2)', () => {
    const utc = toUtc('2026-03-29T03:30:00', 'Europe/Warsaw');
    expect(utc.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  test('after the autumn fallback (Oct 25 2026 03:30 local is UTC+1)', () => {
    const utc = toUtc('2026-10-25T03:30:00', 'Europe/Warsaw');
    expect(utc.toISOString()).toBe('2026-10-25T02:30:00.000Z');
  });
});

describe('rollingWeekWindow', () => {
  test('returns a 7-day window ending at now', () => {
    const now = new Date('2026-05-24T12:00:00.000Z');
    const window = rollingWeekWindow(now);
    expect(window.to.toISOString()).toBe('2026-05-24T12:00:00.000Z');
    expect(window.from.toISOString()).toBe('2026-05-17T12:00:00.000Z');
  });

  test('returns exactly 7 * 86_400_000 ms wide even across the DST jump', () => {
    const now = new Date('2026-04-01T00:00:00.000Z');
    const window = rollingWeekWindow(now);
    expect(window.to.getTime() - window.from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
