import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOverridesValidate } from '../lib/overrides-validate.ts';

let dir: string;
let path: string;
let outLines: string[];
let errLines: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-validate-'));
  path = join(dir, 'overrides.json');
  outLines = [];
  errLines = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const stdout = (line: string): void => {
  outLines.push(line);
};
const stderr = (line: string): void => {
  errLines.push(line);
};

describe('runOverridesValidate', () => {
  test('reports missing file distinctly from a valid empty file', () => {
    const out = runOverridesValidate({ path, stdout, stderr });
    expect(out.kind).toBe('missing');
    expect(outLines[0]).toMatch(/no overrides file found/);
  });

  test('reports OK with size for a valid file', () => {
    writeFileSync(
      path,
      JSON.stringify({
        overrides: [
          {
            match: { source: 'malopolskie-media', source_track_id: '1' },
            spotify_id: 'spotify:track:0jXQrPLm0jKZTXdQRZzj1n',
          },
        ],
      }),
    );
    const out = runOverridesValidate({ path, stdout, stderr });
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.size).toBe(1);
    expect(outLines[0]).toMatch(/OK: 1 override/);
  });

  test('reports error on broken JSON', () => {
    writeFileSync(path, '{ broken');
    const out = runOverridesValidate({ path, stdout, stderr });
    expect(out.kind).toBe('error');
    expect(errLines.length).toBeGreaterThan(0);
  });
});
