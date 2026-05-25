import { describe, expect, test } from 'bun:test';
import { jaroWinkler } from '../src/jaro-winkler.ts';

const SAMPLES = [
  'MARTHA',
  'MARHTA',
  'DIXON',
  'DICKSONX',
  'JELLYFISH',
  'SMELLYFISH',
  'kayah',
  'kayah grzegorz',
  'komodo',
  '',
];

describe('jaroWinkler — known reference values', () => {
  test.each([
    ['MARTHA', 'MARHTA', 0.96],
    ['DIXON', 'DICKSONX', 0.81],
    ['JELLYFISH', 'SMELLYFISH', 0.9],
  ])('jw(%s, %s) ≈ %s', (a, b, expected) => {
    expect(jaroWinkler(a, b)).toBeCloseTo(expected, 1);
  });

  test('identical strings → 1', () => {
    expect(jaroWinkler('hello', 'hello')).toBe(1);
  });

  test('disjoint strings → 0', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  test('one empty string → 0', () => {
    expect(jaroWinkler('', 'hello')).toBe(0);
    expect(jaroWinkler('hello', '')).toBe(0);
  });
});

describe('jaroWinkler — algebraic properties', () => {
  test.each(SAMPLES)('reflexive: jw(%j, %j) === 1', (s) => {
    if (s === '') return;
    expect(jaroWinkler(s, s)).toBe(1);
  });

  test('symmetric across many pairs', () => {
    for (const a of SAMPLES) {
      for (const b of SAMPLES) {
        expect(jaroWinkler(a, b)).toBeCloseTo(jaroWinkler(b, a), 10);
      }
    }
  });

  test('bounded in [0, 1] across many pairs', () => {
    for (const a of SAMPLES) {
      for (const b of SAMPLES) {
        const v = jaroWinkler(a, b);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
