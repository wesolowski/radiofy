import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../src/logger.ts';

let writtenLines: string[];
let originalWrite: typeof process.stdout.write;

beforeEach(() => {
  writtenLines = [];
  originalWrite = process.stdout.write.bind(process.stdout);
  const capture = (chunk: string | Uint8Array): boolean => {
    writtenLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  };
  process.stdout.write = capture as typeof process.stdout.write;
  logger.unbindRunFile();
  logger.resetLevelCache();
});

afterEach(() => {
  process.stdout.write = originalWrite;
  logger.unbindRunFile();
});

describe('stdout output', () => {
  test('emits a single line of valid JSON with the expected fields', () => {
    logger.info('crawl started', { station: 'radio-zet' });
    expect(writtenLines).toHaveLength(1);
    const raw = writtenLines[0] ?? '';
    expect(raw.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
    expect(parsed['level']).toBe('info');
    expect(parsed['msg']).toBe('crawl started');
    expect(parsed['station']).toBe('radio-zet');
    expect(typeof parsed['ts']).toBe('string');
  });
});

describe('bindRunFile', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'radiofy-logger-'));
    path = join(dir, 'sync-radio-zet.log');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('writes exactly two lines after binding then logging twice', () => {
    logger.bindRunFile(path);
    logger.info('first');
    logger.info('second');
    logger.unbindRunFile();
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
  });

  test('re-binding the same path truncates again', () => {
    logger.bindRunFile(path);
    logger.info('old run');
    logger.unbindRunFile();
    logger.bindRunFile(path);
    logger.info('new run');
    logger.unbindRunFile();
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(parsed['msg']).toBe('new run');
  });

  test('creates missing parent directories recursively', () => {
    const nested = join(dir, 'a', 'b', 'c', 'sync.log');
    logger.bindRunFile(nested);
    logger.info('deep');
    logger.unbindRunFile();
    expect(readFileSync(nested, 'utf-8').length).toBeGreaterThan(0);
  });
});
