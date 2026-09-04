import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const WRAPPER = resolve('docs/operations/bin/radiofy-cron.sh');

let dir: string;
let binDir: string;
let pingLog: string;

/** A stand-in for `curl` that records every URL it is asked to fetch. */
const installFakeCurl = (exitCode = 0): void => {
  const script = `#!/usr/bin/env bash
for arg in "$@"; do
  case "$arg" in
    http*) echo "$arg" >> "${pingLog}" ;;
  esac
done
exit ${exitCode}
`;
  const path = join(binDir, 'curl');
  writeFileSync(path, script);
  chmodSync(path, 0o755);
};

/** A stand-in for `bun` that exits with a chosen code. */
const installFakeBun = (exitCode: number): void => {
  const path = join(binDir, 'bun');
  writeFileSync(path, `#!/usr/bin/env bash\necho "ran: $*"\nexit ${exitCode}\n`);
  chmodSync(path, 0o755);
};

const runWrapper = async (
  env: Record<string, string> = {},
): Promise<{ exitCode: number; pings: string[] }> => {
  const proc = Bun.spawn([WRAPPER, 'RADIOFY_HEALTHCHECK_TEST', 'weekly'], {
    env: {
      PATH: `${binDir}:${process.env['PATH'] ?? ''}`,
      RADIOFY_ROOT: dir,
      HOME: dir,
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  let pings: string[] = [];
  try {
    pings = readFileSync(pingLog, 'utf-8').trim().split('\n').filter(Boolean);
  } catch {
    pings = [];
  }
  return { exitCode, pings };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'radiofy-cron-'));
  binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(dir, 'storage', 'logs'), { recursive: true });
  pingLog = join(dir, 'pings.txt');
  writeFileSync(join(dir, '.env'), 'RADIOFY_HEALTHCHECK_TEST=https://hc.example/abc123\n');
  installFakeCurl();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('radiofy-cron.sh', () => {
  test('pings start then success when the command succeeds', async () => {
    installFakeBun(0);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(0);
    expect(pings).toEqual(['https://hc.example/abc123/start', 'https://hc.example/abc123']);
  });

  test('pings start then fail when the command fails, never success', async () => {
    installFakeBun(1);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(1);
    expect(pings).toEqual(['https://hc.example/abc123/start', 'https://hc.example/abc123/fail']);
    expect(pings).not.toContain('https://hc.example/abc123');
  });

  test('treats a blocked run (exit 2) as a failure and preserves the code', async () => {
    installFakeBun(2);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(2);
    expect(pings[1]).toBe('https://hc.example/abc123/fail');
  });

  test('a failing ping never changes the outcome of a successful run', async () => {
    installFakeBun(0);
    installFakeCurl(7);

    const { exitCode } = await runWrapper();

    expect(exitCode).toBe(0);
  });

  test('a failing ping never masks a failed run', async () => {
    installFakeBun(1);
    installFakeCurl(7);

    const { exitCode } = await runWrapper();

    expect(exitCode).toBe(1);
  });

  test('runs the command and stays silent when no health check is configured', async () => {
    writeFileSync(join(dir, '.env'), 'LOG_LEVEL=info\n');
    installFakeBun(0);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(0);
    expect(pings).toEqual([]);
  });

  test('preserves a failing exit code when no health check is configured', async () => {
    writeFileSync(join(dir, '.env'), 'LOG_LEVEL=info\n');
    installFakeBun(1);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(1);
    expect(pings).toEqual([]);
  });

  test('works when there is no .env file at all', async () => {
    rmSync(join(dir, '.env'));
    installFakeBun(0);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(0);
    expect(pings).toEqual([]);
  });

  test('refuses to run without the two required arguments', async () => {
    installFakeBun(0);
    const proc = Bun.spawn([WRAPPER], {
      env: { PATH: `${binDir}:${process.env['PATH'] ?? ''}`, RADIOFY_ROOT: dir, HOME: dir },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    expect(exitCode).not.toBe(0);
    expect(await new Response(proc.stderr).text()).toContain('usage');
  });
});
