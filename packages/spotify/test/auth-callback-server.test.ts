import { afterEach, describe, expect, test } from 'bun:test';
import { startCallbackServer } from '../src/auth-callback-server.ts';

const PORT = 18888;

let close: (() => void) | null = null;

afterEach(() => {
  close?.();
  close = null;
});

describe('startCallbackServer', () => {
  test('resolves with code on a valid callback', async () => {
    const server = startCallbackServer(PORT, 'expected-state');
    close = server.close;
    const res = await fetch(`${server.url}?state=expected-state&code=ABC123`);
    expect(res.status).toBe(200);
    const result = await server.result;
    expect(result).toEqual({ kind: 'ok', code: 'ABC123' });
  });

  test('returns HTTP 400 and resolves to error on missing state', async () => {
    const server = startCallbackServer(PORT, 'expected-state');
    close = server.close;
    const res = await fetch(`${server.url}?code=ABC123`);
    expect(res.status).toBe(400);
    const result = await server.result;
    expect(result.kind).toBe('error');
  });

  test('returns HTTP 400 and resolves to error on mismatched state', async () => {
    const server = startCallbackServer(PORT, 'expected-state');
    close = server.close;
    const res = await fetch(`${server.url}?state=hostile&code=ABC123`);
    expect(res.status).toBe(400);
    const result = await server.result;
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.reason).toMatch(/state/i);
    }
  });

  test('returns HTTP 400 and resolves to error on missing code', async () => {
    const server = startCallbackServer(PORT, 'expected-state');
    close = server.close;
    const res = await fetch(`${server.url}?state=expected-state`);
    expect(res.status).toBe(400);
    const result = await server.result;
    expect(result.kind).toBe('error');
  });

  test('returns HTTP 404 for any non-callback path', async () => {
    const server = startCallbackServer(PORT, 'expected-state');
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${PORT}/other`);
    expect(res.status).toBe(404);
  });
});
