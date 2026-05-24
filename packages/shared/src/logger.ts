import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadLogLevel } from './config.ts';
import type { Level } from './types.ts';

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let fileFd: number | null = null;
let cachedLevel: Level | null = null;

const currentLevel = (): Level => {
  if (cachedLevel === null) {
    cachedLevel = loadLogLevel();
  }
  return cachedLevel;
};

const shouldLog = (level: Level): boolean => LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];

const emit = (level: Level, msg: string, fields: Record<string, unknown>): void => {
  if (!shouldLog(level)) return;
  const entry = { level, msg, ts: new Date().toISOString(), ...fields };
  const line = `${JSON.stringify(entry)}\n`;
  process.stdout.write(line);
  if (fileFd !== null) {
    writeSync(fileFd, line);
  }
};

export const logger = {
  debug: (msg: string, fields: Record<string, unknown> = {}): void => emit('debug', msg, fields),
  info: (msg: string, fields: Record<string, unknown> = {}): void => emit('info', msg, fields),
  warn: (msg: string, fields: Record<string, unknown> = {}): void => emit('warn', msg, fields),
  error: (msg: string, fields: Record<string, unknown> = {}): void => emit('error', msg, fields),

  bindRunFile: (path: string): void => {
    if (fileFd !== null) {
      closeSync(fileFd);
      fileFd = null;
    }
    mkdirSync(dirname(path), { recursive: true });
    fileFd = openSync(path, 'w');
  },

  unbindRunFile: (): void => {
    if (fileFd !== null) {
      closeSync(fileFd);
      fileFd = null;
    }
  },

  resetLevelCache: (): void => {
    cachedLevel = null;
  },
};
