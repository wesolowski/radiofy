import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { AppConfig, Level, Station } from './types.ts';

const LevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const AppConfigSchema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: z.string().url().default('http://127.0.0.1:8888/callback'),
  LOG_LEVEL: LevelSchema.default('info'),
});

const StationSchema: z.ZodType<Station> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.string().min(1),
  sourceSlug: z.string().min(1),
  playlistName: z.string().min(1),
  enabled: z.boolean(),
});

const StationsSchema = z.array(StationSchema);

const formatIssues = (error: z.ZodError, root: string): string =>
  error.issues
    .map((i) => {
      const segments = i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('');
      const path = i.path.length === 0 ? root : `${root}${segments}`;
      return `${path}: ${i.message}`;
    })
    .join('\n  ');

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const result = AppConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`config: invalid environment\n  ${formatIssues(result.error, 'env')}`);
  }
  return result.data;
};

export const loadLogLevel = (env: NodeJS.ProcessEnv = process.env): Level => {
  const raw = env['LOG_LEVEL'];
  const parsed = LevelSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'info';
};

export const loadStations = (path = 'config/stations.json'): Station[] => {
  const raw = readFileSync(path, 'utf-8');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`stations: ${path} is not valid JSON`, { cause });
  }
  const result = StationsSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `stations: invalid config at ${path}\n  ${formatIssues(result.error, 'stations')}`,
    );
  }
  return result.data;
};
