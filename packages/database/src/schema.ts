import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const songs = sqliteTable('songs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  normalizedKey: text('normalized_key').notNull().unique(),
  primaryArtist: text('primary_artist').notNull(),
  allArtists: text('all_artists').notNull(),
  title: text('title').notNull(),
});

export const plays = sqliteTable(
  'plays',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').notNull(),
    sourceTrackId: text('source_track_id').notNull(),
    station: text('station').notNull(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id),
    playedAt: text('played_at').notNull(),
    crawledAt: text('crawled_at').notNull(),
  },
  (t) => ({
    uniquePlay: uniqueIndex('idx_plays_unique').on(
      t.source,
      t.sourceTrackId,
      t.station,
      t.playedAt,
    ),
    byStationTime: index('idx_plays_station_time').on(t.station, t.playedAt),
  }),
);

export const spotifyMatches = sqliteTable('spotify_matches', {
  songId: integer('song_id')
    .primaryKey()
    .references(() => songs.id),
  spotifyTrackId: text('spotify_track_id').notNull(),
  score: real('score').notNull(),
  matchedAt: text('matched_at').notNull(),
  sourceOfTruth: text('source_of_truth', { enum: ['auto', 'manual'] }).notNull(),
});

export const unmatchedSongs = sqliteTable(
  'unmatched_songs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    normalizedKey: text('normalized_key').notNull().unique(),
    artist: text('artist').notNull(),
    title: text('title').notNull(),
    source: text('source').notNull(),
    sourceTrackId: text('source_track_id'),
    station: text('station').notNull(),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    reason: text('reason', { enum: ['no_results', 'low_confidence', 'api_error'] }).notNull(),
    bestCandidateSpotifyId: text('best_candidate_spotify_id'),
    bestCandidateScore: real('best_candidate_score'),
    resolvedAt: text('resolved_at'),
  },
  (t) => ({
    openIdx: index('idx_unmatched_open').on(t.resolvedAt).where(sql`${t.resolvedAt} IS NULL`),
  }),
);

export const crawlRuns = sqliteTable('crawl_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  station: text('station').notNull(),
  day: text('day').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  songsSeen: integer('songs_seen'),
  error: text('error'),
});

export const playlistSyncRuns = sqliteTable('playlist_sync_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  station: text('station').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  tracksWritten: integer('tracks_written'),
  error: text('error'),
});

export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type Play = typeof plays.$inferSelect;
export type NewPlay = typeof plays.$inferInsert;
export type SpotifyMatch = typeof spotifyMatches.$inferSelect;
export type NewSpotifyMatch = typeof spotifyMatches.$inferInsert;
export type UnmatchedSong = typeof unmatchedSongs.$inferSelect;
export type NewUnmatchedSong = typeof unmatchedSongs.$inferInsert;
export type CrawlRun = typeof crawlRuns.$inferSelect;
export type NewCrawlRun = typeof crawlRuns.$inferInsert;
export type PlaylistSyncRun = typeof playlistSyncRuns.$inferSelect;
export type NewPlaylistSyncRun = typeof playlistSyncRuns.$inferInsert;
