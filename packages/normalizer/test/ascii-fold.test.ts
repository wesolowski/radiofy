import { describe, expect, test } from 'bun:test';
import { asciiFold } from '../src/ascii-fold.ts';

describe('asciiFold — Polish diacritics', () => {
  test.each([
    ['ł', 'l'],
    ['ą', 'a'],
    ['ę', 'e'],
    ['ć', 'c'],
    ['ń', 'n'],
    ['ó', 'o'],
    ['ś', 's'],
    ['ź', 'z'],
    ['ż', 'z'],
  ])('%s folds to %s', (input, expected) => {
    expect(asciiFold(input)).toBe(expected);
  });

  test.each([
    ['Ł', 'l'],
    ['Ą', 'a'],
    ['Ż', 'z'],
  ])('uppercase %s folds to %s', (input, expected) => {
    expect(asciiFold(input)).toBe(expected);
  });

  test('handles full Polish word', () => {
    expect(asciiFold('Miłości')).toBe('Milosci');
    expect(asciiFold('Hyży')).toBe('Hyzy');
    expect(asciiFold('Dąbrowska')).toBe('Dabrowska');
  });

  test('NFD-strips other European accents', () => {
    expect(asciiFold('café')).toBe('cafe');
    expect(asciiFold('naïve')).toBe('naive');
    expect(asciiFold('über')).toBe('uber');
  });

  test('passes ASCII through unchanged', () => {
    expect(asciiFold('Plain Text 123')).toBe('Plain Text 123');
  });
});
