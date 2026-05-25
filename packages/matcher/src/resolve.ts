import {
  type Db,
  type NewUnmatchedSong,
  type UnmatchedSong,
  matchesRepo,
  songsRepo,
  unmatchedRepo,
  withTransaction,
} from '@radiofy/database';
import type { NormalizedSong, RawSong } from '@radiofy/shared';
import { logger } from '@radiofy/shared';
import {
  type ScoredCandidate,
  type SearchOptions,
  SpotifyAuthExpiredError,
  SpotifyTransientError,
  searchTrack,
} from '@radiofy/spotify';
import type { ResolveInput as OverrideResolveInput, OverrideTable } from './overrides.ts';

const AUTO_MATCH_THRESHOLD = 0.85;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface ResolveContext {
  db: Db;
  overrides: OverrideTable;
  accessToken: string;
  source: string;
  station: string;
  rawSong: RawSong;
  normalized: NormalizedSong;
  now?: string;
  search?: typeof searchTrack;
  searchOptions?: SearchOptions;
}

export type ResolveOutcome =
  | { kind: 'override'; spotifyTrackId: string }
  | { kind: 'cache'; spotifyTrackId: string }
  | { kind: 'auto'; spotifyTrackId: string; score: number }
  | { kind: 'low_confidence'; bestCandidate: ScoredCandidate }
  | { kind: 'no_results' }
  | { kind: 'api_error'; message: string };

const nowIso = (now?: string): string => now ?? new Date().toISOString();

const buildOverrideInput = (ctx: ResolveContext): OverrideResolveInput => ({
  source: ctx.source,
  sourceTrackId: ctx.rawSong.sourceTrackId,
  normalizedKey: ctx.normalized.normalizedKey,
  primaryArtist: ctx.normalized.primaryArtist,
  title: ctx.normalized.title,
});

const upsertSong = (ctx: ResolveContext): number => {
  const song = songsRepo.upsertByNormalizedKey(ctx.db, {
    normalizedKey: ctx.normalized.normalizedKey,
    primaryArtist: ctx.normalized.primaryArtist,
    allArtists: ctx.normalized.allArtists,
    title: ctx.normalized.title,
  });
  return song.id;
};

const markUnmatchedResolved = (db: Db, normalizedKey: string, ts: string): void => {
  unmatchedRepo.markResolved(db, normalizedKey, ts);
};

const writeAutoMatch = (
  ctx: ResolveContext,
  spotifyTrackId: string,
  score: number,
  ts: string,
): void => {
  withTransaction(ctx.db, (tx) => {
    const songId = upsertSong({ ...ctx, db: tx });
    matchesRepo.upsert(tx, {
      songId,
      spotifyTrackId,
      score,
      matchedAt: ts,
      sourceOfTruth: 'auto',
    });
  });
};

const writeOverrideMatch = (ctx: ResolveContext, spotifyTrackId: string, ts: string): void => {
  withTransaction(ctx.db, (tx) => {
    const songId = upsertSong({ ...ctx, db: tx });
    matchesRepo.upsert(tx, {
      songId,
      spotifyTrackId,
      score: 1,
      matchedAt: ts,
      sourceOfTruth: 'manual',
    });
    markUnmatchedResolved(tx, ctx.normalized.normalizedKey, ts);
  });
};

const buildUnmatched = (
  ctx: ResolveContext,
  reason: UnmatchedSong['reason'],
  bestCandidate: ScoredCandidate | null,
  ts: string,
): NewUnmatchedSong => ({
  normalizedKey: ctx.normalized.normalizedKey,
  artist: ctx.normalized.primaryArtist,
  title: ctx.normalized.title,
  source: ctx.source,
  sourceTrackId: ctx.rawSong.sourceTrackId,
  station: ctx.station,
  firstSeenAt: ts,
  lastSeenAt: ts,
  reason,
  bestCandidateSpotifyId: bestCandidate?.spotifyTrackId ?? null,
  bestCandidateScore: bestCandidate?.score ?? null,
});

const writeUnmatched = (
  ctx: ResolveContext,
  reason: UnmatchedSong['reason'],
  bestCandidate: ScoredCandidate | null,
  ts: string,
): void => {
  withTransaction(ctx.db, (tx) => {
    const row = buildUnmatched({ ...ctx, db: tx }, reason, bestCandidate, ts);
    unmatchedRepo.upsertOccurrence(tx, row);
  });
};

const cachedSpotifyId = (ctx: ResolveContext): string | null => {
  const song = songsRepo.getByNormalizedKey(ctx.db, ctx.normalized.normalizedKey);
  if (song === undefined) return null;
  const cached = matchesRepo.get(ctx.db, song.id);
  return cached?.spotifyTrackId ?? null;
};

export const resolveSong = async (ctx: ResolveContext): Promise<ResolveOutcome> => {
  const ts = nowIso(ctx.now);

  const overrideHit = ctx.overrides.resolve(buildOverrideInput(ctx));
  if (overrideHit !== null) {
    writeOverrideMatch(ctx, overrideHit, ts);
    return { kind: 'override', spotifyTrackId: overrideHit };
  }

  const cached = cachedSpotifyId(ctx);
  if (cached !== null) {
    return { kind: 'cache', spotifyTrackId: cached };
  }

  let candidates: ScoredCandidate[];
  try {
    const search = ctx.search ?? searchTrack;
    candidates = await search(ctx.normalized, ctx.accessToken, ctx.searchOptions ?? {});
  } catch (err) {
    if (err instanceof SpotifyAuthExpiredError) {
      throw err;
    }
    if (err instanceof SpotifyTransientError) {
      logger.warn('matcher: search transient error', {
        station: ctx.station,
        key: ctx.normalized.normalizedKey,
      });
      writeUnmatched(ctx, 'api_error', null, ts);
      return { kind: 'api_error', message: err.message };
    }
    throw err;
  }

  const top = candidates[0];

  if (top === undefined) {
    writeUnmatched(ctx, 'no_results', null, ts);
    return { kind: 'no_results' };
  }

  if (top.score >= AUTO_MATCH_THRESHOLD) {
    writeAutoMatch(ctx, top.spotifyTrackId, top.score, ts);
    return { kind: 'auto', spotifyTrackId: top.spotifyTrackId, score: top.score };
  }

  if (top.score >= LOW_CONFIDENCE_THRESHOLD) {
    writeUnmatched(ctx, 'low_confidence', top, ts);
    return { kind: 'low_confidence', bestCandidate: top };
  }

  writeUnmatched(ctx, 'no_results', top, ts);
  return { kind: 'no_results' };
};
