CREATE TABLE `crawl_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`station` text NOT NULL,
	`day` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`songs_seen` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `playlist_sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`station` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`tracks_written` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `plays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_track_id` text NOT NULL,
	`station` text NOT NULL,
	`song_id` integer NOT NULL,
	`played_at` text NOT NULL,
	`crawled_at` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plays_unique` ON `plays` (`source`,`source_track_id`,`station`,`played_at`);--> statement-breakpoint
CREATE INDEX `idx_plays_station_time` ON `plays` (`station`,`played_at`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_key` text NOT NULL,
	`primary_artist` text NOT NULL,
	`all_artists` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_normalized_key_unique` ON `songs` (`normalized_key`);--> statement-breakpoint
CREATE TABLE `spotify_matches` (
	`song_id` integer PRIMARY KEY NOT NULL,
	`spotify_track_id` text NOT NULL,
	`score` real NOT NULL,
	`matched_at` text NOT NULL,
	`source_of_truth` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `unmatched_songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_key` text NOT NULL,
	`artist` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`source_track_id` text,
	`station` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`occurrence_count` integer DEFAULT 1 NOT NULL,
	`reason` text NOT NULL,
	`best_candidate_spotify_id` text,
	`best_candidate_score` real,
	`resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unmatched_songs_normalized_key_unique` ON `unmatched_songs` (`normalized_key`);--> statement-breakpoint
CREATE INDEX `idx_unmatched_open` ON `unmatched_songs` (`resolved_at`) WHERE "unmatched_songs"."resolved_at" IS NULL;