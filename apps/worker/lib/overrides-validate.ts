import { existsSync } from 'node:fs';
import { loadOverrides } from '@radiofy/matcher';

const DEFAULT_PATH = 'storage/overrides.json';

export interface OverridesValidateOptions {
  path?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export type OverridesValidateOutcome =
  | { kind: 'missing'; path: string }
  | { kind: 'ok'; size: number; path: string }
  | { kind: 'error'; path: string; message: string };

export const runOverridesValidate = (
  options: OverridesValidateOptions = {},
): OverridesValidateOutcome => {
  const path = options.path ?? DEFAULT_PATH;
  const stdout =
    options.stdout ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });
  const stderr =
    options.stderr ??
    ((line: string): void => {
      process.stderr.write(`${line}\n`);
    });

  if (!existsSync(path)) {
    stdout(`no overrides file found at ${path}`);
    return { kind: 'missing', path };
  }

  try {
    const table = loadOverrides(path);
    stdout(`OK: ${table.size} override(s) loaded from ${path}`);
    return { kind: 'ok', size: table.size, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr(message);
    return { kind: 'error', path, message };
  }
};
