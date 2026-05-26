import { describe, expect, test } from 'bun:test';
import { csvCell, csvLine } from '../lib/csv.ts';

describe('csvCell', () => {
  test('passes simple text through unquoted', () => {
    expect(csvCell('hello')).toBe('hello');
  });

  test('quotes values with commas', () => {
    expect(csvCell('a, b')).toBe('"a, b"');
  });

  test('quotes values with embedded quotes and doubles the inner quote', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  test('quotes values with newlines', () => {
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  test('null/undefined become empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  test('numbers become string', () => {
    expect(csvCell(42)).toBe('42');
  });
});

describe('csvLine', () => {
  test('joins cells with commas', () => {
    expect(csvLine(['a', 'b', 'c'])).toBe('a,b,c');
  });

  test('quotes individual cells as needed', () => {
    expect(csvLine(['a', 'b, c', null, 42])).toBe('a,"b, c",,42');
  });
});
