import { readFileSync } from 'node:fs';
import { normalizeKeyOnly } from '@radiofy/normalizer';
import { logger } from '@radiofy/shared';
import { z } from 'zod';

const DEFAULT_PATH = 'storage/overrides.json';

const SPOTIFY_URI = /^spotify:track:[A-Za-z0-9]{22}$/;

const SourceMatch = z
  .object({
    source: z.string().min(1),
    source_track_id: z.string().min(1),
  })
  .strict();

const KeyMatch = z
  .object({
    normalized_key: z.string().min(1),
  })
  .strict();

const ArtistTitleMatch = z
  .object({
    artist: z.string().min(1),
    title: z.string().min(1),
  })
  .strict();

const MatchSchema = z.union([SourceMatch, KeyMatch, ArtistTitleMatch]);

const EntrySchema = z
  .object({
    match: MatchSchema,
    spotify_id: z.string().regex(SPOTIFY_URI, {
      message: 'spotify_id must look like spotify:track:<22 alphanumeric chars>',
    }),
    note: z.string().optional(),
  })
  .strict();

const FileSchema = z.object({ overrides: z.array(EntrySchema) }).strict();

export interface ResolveInput {
  source: string;
  sourceTrackId: string;
  normalizedKey: string;
  primaryArtist: string;
  title: string;
}

interface IndexedEntry {
  spotifyId: string;
  index: number;
}

export class OverrideTable {
  private readonly bySource: ReadonlyMap<string, string>;
  private readonly byKey: ReadonlyMap<string, string>;
  private readonly byArtistTitle: ReadonlyMap<string, string>;
  readonly size: number;

  constructor(
    bySource: ReadonlyMap<string, string>,
    byKey: ReadonlyMap<string, string>,
    byArtistTitle: ReadonlyMap<string, string>,
    size: number,
  ) {
    this.bySource = bySource;
    this.byKey = byKey;
    this.byArtistTitle = byArtistTitle;
    this.size = size;
  }

  resolve(input: ResolveInput): string | null {
    const sourceKey = `${input.source}:${input.sourceTrackId}`;
    const sourceHit = this.bySource.get(sourceKey);
    if (sourceHit !== undefined) return sourceHit;

    const keyHit = this.byKey.get(input.normalizedKey);
    if (keyHit !== undefined) return keyHit;

    const artistTitleKey = normalizeKeyOnly(input.primaryArtist, input.title);
    const atHit = this.byArtistTitle.get(artistTitleKey);
    if (atHit !== undefined) return atHit;

    return null;
  }
}

const formatZodIssues = (error: z.ZodError, root: string): string =>
  error.issues
    .map((i) => {
      const segments = i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('');
      const path = i.path.length === 0 ? root : `${root}${segments}`;
      return `${path}: ${i.message}`;
    })
    .join('\n  ');

const insertUnique = (
  map: Map<string, IndexedEntry>,
  key: string,
  entry: IndexedEntry,
  label: string,
): void => {
  const prev = map.get(key);
  if (prev !== undefined && prev.spotifyId !== entry.spotifyId) {
    throw new Error(
      `overrides: conflict at entries [${prev.index}, ${entry.index}] — same ${label} (${key}) maps to two different spotify_id values`,
    );
  }
  map.set(key, entry);
};

const flatten = (map: ReadonlyMap<string, IndexedEntry>): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [k, v] of map) out.set(k, v.spotifyId);
  return out;
};

export const loadOverrides = (path: string = DEFAULT_PATH): OverrideTable => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      logger.info(`no overrides file found at ${path}`);
      return new OverrideTable(new Map(), new Map(), new Map(), 0);
    }
    throw err;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`overrides: ${path} is not valid JSON`, { cause });
  }

  const result = FileSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `overrides: invalid schema at ${path}\n  ${formatZodIssues(result.error, 'overrides')}`,
    );
  }

  const bySource = new Map<string, IndexedEntry>();
  const byKey = new Map<string, IndexedEntry>();
  const byArtistTitle = new Map<string, IndexedEntry>();

  result.data.overrides.forEach((entry, index) => {
    const m = entry.match;
    if ('source' in m) {
      insertUnique(
        bySource,
        `${m.source}:${m.source_track_id}`,
        { spotifyId: entry.spotify_id, index },
        'source/source_track_id',
      );
    } else if ('normalized_key' in m) {
      insertUnique(
        byKey,
        m.normalized_key,
        { spotifyId: entry.spotify_id, index },
        'normalized_key',
      );
    } else {
      const k = normalizeKeyOnly(m.artist, m.title);
      insertUnique(byArtistTitle, k, { spotifyId: entry.spotify_id, index }, 'artist/title');
    }
  });

  return new OverrideTable(
    flatten(bySource),
    flatten(byKey),
    flatten(byArtistTitle),
    result.data.overrides.length,
  );
};
