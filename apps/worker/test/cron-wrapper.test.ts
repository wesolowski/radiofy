import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const WRAPPER = resolve('docs/operations/bin/radiofy-cron.sh');

let dir: string;
let binDir: string;
let pingLog: string;

/**
 * A stand-in for `curl`. The wrapper passes the URL through a config file on
 * stdin rather than as an argument, so the fake reads both and tags anything
 * that arrives in argv — which is what keeps the URL out of `ps`.
 */
const installFakeCurl = (exitCode = 0): void => {
  const lines = [
    '#!/usr/bin/env bash',
    'for arg in "$@"; do',
    '  case "$arg" in',
    `    http*) echo "argv:$arg" >> "${pingLog}" ;;`,
    '  esac',
    'done',
    'if [ ! -t 0 ]; then',
    `  sed -n 's/^url = "\\(.*\\)"$/\\1/p' >> "${pingLog}"`,
    'fi',
    `exit ${exitCode}`,
    '',
  ];
  const path = join(binDir, 'curl');
  writeFileSync(path, lines.join('\n'));
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

  test('a failing success ping is never reported as a failed run', async () => {
    installFakeBun(0);
    installFakeCurl(7);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(0);
    expect(pings).toEqual(['https://hc.example/abc123/start', 'https://hc.example/abc123']);
    expect(pings).not.toContain('https://hc.example/abc123/fail');
  });

  test('a failing ping never masks a failed run', async () => {
    installFakeBun(1);
    installFakeCurl(7);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(1);
    expect(pings).toEqual(['https://hc.example/abc123/start', 'https://hc.example/abc123/fail']);
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

  test('stays silent when the health-check variable is present but empty', async () => {
    writeFileSync(join(dir, '.env'), 'RADIOFY_HEALTHCHECK_TEST=\nLOG_LEVEL=info\n');
    installFakeBun(0);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(0);
    expect(pings).toEqual([]);
  });

  test('forwards the command and its arguments to bun unchanged', async () => {
    installFakeBun(0);

    await runWrapper();

    expect(readFileSync(join(dir, 'storage', 'logs', 'cron.log'), 'utf-8')).toContain(
      'ran: run weekly',
    );
  });

  test('records the failing command and its exit code in the log', async () => {
    installFakeBun(3);

    await runWrapper();

    expect(readFileSync(join(dir, 'storage', 'logs', 'cron.log'), 'utf-8')).toContain(
      "radiofy-cron: 'weekly' exited 3",
    );
  });

  test('reads a health-check value written with Windows line endings', async () => {
    writeFileSync(join(dir, '.env'), 'RADIOFY_HEALTHCHECK_TEST=https://hc.example/abc123\r\n');
    installFakeBun(0);

    const { pings } = await runWrapper();

    expect(pings).toEqual(['https://hc.example/abc123/start', 'https://hc.example/abc123']);
  });

  test('never executes the contents of .env', async () => {
    const marker = join(dir, 'SHOULD_NOT_EXIST');
    writeFileSync(
      join(dir, '.env'),
      `RADIOFY_HEALTHCHECK_TEST=https://hc.example/abc123\nEVIL=$(touch ${marker})\n`,
    );
    installFakeBun(0);

    const { exitCode, pings } = await runWrapper();

    expect(exitCode).toBe(0);
    expect(existsSync(marker)).toBe(false);
    expect(pings[0]).toBe('https://hc.example/abc123/start');
  });

  test('rejects a health-check argument that is not a variable name', async () => {
    installFakeBun(0);
    const proc = Bun.spawn([WRAPPER, 'not-a-var-name', 'weekly'], {
      env: { PATH: `${binDir}:${process.env['PATH'] ?? ''}`, RADIOFY_ROOT: dir, HOME: dir },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await proc.exited).toBe(64);
  });

  test('keeps the ping URL out of the process arguments', async () => {
    installFakeBun(0);

    const { pings } = await runWrapper();

    expect(pings.some((p) => p.startsWith('argv:'))).toBe(false);
    expect(pings).toContain('https://hc.example/abc123/start');
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
