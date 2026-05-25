import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { generateChallenge, generateState, generateVerifier } from '../src/pkce.ts';

describe('generateVerifier', () => {
  test('returns RFC 7636-compliant length (43–128 chars)', () => {
    const v = generateVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  test('uses only URL-safe base64 characters', () => {
    const v = generateVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('returns distinct values on repeated calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) seen.add(generateVerifier());
    expect(seen.size).toBe(10);
  });
});

describe('generateChallenge', () => {
  test('is base64url(sha256(verifier))', () => {
    const v = 'this-is-a-fixed-verifier-for-the-test';
    const expected = createHash('sha256').update(v).digest('base64url');
    expect(generateChallenge(v)).toBe(expected);
  });

  test('is deterministic for the same input', () => {
    const v = generateVerifier();
    expect(generateChallenge(v)).toBe(generateChallenge(v));
  });
});

describe('generateState', () => {
  test('encodes >= 32 random bytes (>= 43 base64url chars)', () => {
    const s = generateState();
    expect(s.length).toBeGreaterThanOrEqual(43);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('returns distinct values on repeated calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) seen.add(generateState());
    expect(seen.size).toBe(10);
  });
});
