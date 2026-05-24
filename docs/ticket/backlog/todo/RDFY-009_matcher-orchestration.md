# [RDFY-009] Matcher orchestration

## Type
feature

## Risk
medium

## Priority
high

## Status
todo

## Owner
implementer

## Background
The matcher ties normalization, the Spotify cache, the Spotify search, and the unmatched-songs inbox into one decision pipeline. Its contract is the single point any caller uses to ask "what is the Spotify ID for this song?" — without it the worker cannot build a playlist.

**Dependency**: this ticket consumes the override resolver from `RDFY-010` (manual overrides loader). RDFY-010 must be implemented and reviewed before this ticket starts, regardless of the numeric ID ordering.

## Scope
- **In scope**:
  - `packages/matcher/resolve.ts`: `resolveSong(song) → { spotifyTrackId, source: 'override'|'cache'|'auto' } | { spotifyTrackId: null, reason }`
  - Resolution order: manual override (from RDFY-010) → `spotify_matches` cache → live Spotify search
  - Auto-match (`score >= 0.85`) → upsert into `spotify_matches` with `source_of_truth='auto'`
  - Low-confidence (`0.60 <= score < 0.85`) → upsert into `unmatched_songs` with `reason='low_confidence'` and `best_candidate_*`, return null
  - No results / score < 0.60 → upsert into `unmatched_songs` with `reason='no_results'`, return null
  - `SpotifyTransientError` → upsert into `unmatched_songs` with `reason='api_error'`, return null (do not crash the run)
  - All DB writes for a single resolve call wrapped in `withTransaction`
- **Out of scope (explicit)**: crawl, playlist replace, CSV export, override file format/parsing (that's RDFY-010 — this ticket only consumes the override resolver as a dependency).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Matcher Thresholds", "Unmatched Songs Tracking"
- `RDFY-003`, `RDFY-005`, `RDFY-007`, `RDFY-010`

## Acceptance Criteria
- [ ] Cache hit returns the cached ID without calling Spotify
- [ ] Override hit beats both cache and live search; the resolver upserts the override into `spotify_matches` with `source_of_truth='manual'`
- [ ] **Override hit also sets `unmatched_songs.resolved_at = now()` for any existing row matching the song's `normalized_key`** (in the same transaction as the `spotify_matches` upsert). Subsequent crawls of the same song do not reopen the unmatched row.
- [ ] Auto-match path writes one `spotify_matches` row and zero `unmatched_songs` rows
- [ ] Low-confidence path writes zero `spotify_matches` rows and one `unmatched_songs` row with `reason='low_confidence'`, `best_candidate_spotify_id`, `best_candidate_score`
- [ ] Second occurrence of an unmatched song bumps `occurrence_count` and `last_seen_at`, does not insert a duplicate
- [ ] API error path records `reason='api_error'` and the function returns `null` (worker keeps going for other songs)
- [ ] When `unmatched_songs.resolved_at` is set, a subsequent `resolveSong` for the same song returns the override and no Spotify call happens
- [ ] Transaction scope: the HTTP call to Spotify is **outside** any DB transaction; only the post-search write phase is wrapped in `withTransaction`

## Verification (manual)
1. Seed cache with a known song → call `resolveSong` → returns cached ID, network traffic = 0
2. Run against a fixture song with no Spotify match → row appears in `unmatched_songs`; second run bumps `occurrence_count` to 2
3. Add an override for that song, re-run → row gets `resolved_at` set, song now resolves via override path
