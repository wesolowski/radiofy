# PROJECT_ARCHITECTURE.md

# Overview

This document describes the overall architecture, project structure, responsibilities, and technical boundaries of the Radio Playlist Sync system.

The goal of the project is to automatically crawl radio playlists and synchronize them with Spotify playlists.

---

# Core Goal

The system should:

1. Crawl radio playlist websites
2. Extract songs from HTML
3. Normalize song metadata
4. Detect duplicates
5. Match songs with Spotify tracks
6. Update Spotify playlists automatically

---

# Technology Stack

## Runtime

* Bun
* TypeScript

## Crawling

* fetch
* cheerio
* Playwright (fallback only)

## Database

* SQLite
* Drizzle ORM

## External APIs

* Spotify Web API

---

# High-Level Architecture

```txt id="8hwlz1"
Radio Website
      ↓
Crawler
      ↓
HTML Parser
      ↓
Song Normalizer
      ↓
Duplicate Detection
      ↓
Spotify Matcher
      ↓
Spotify Playlist Updater
      ↓
SQLite Storage
```

---

# Project Structure

```txt
radiofy/
│
├── .claude/
│   ├── agents/
│   ├── commands/
│   ├── hooks/
│   ├── skills/
│   └── templates/
│
├── docs/
│   ├── architecture/
│   ├── ticket/                  # backlog (todo/in-progress/review/done) + results
│   └── html/                    # source HTML samples for parser tests
│
├── apps/
│   ├── worker/                  # CLI entry, subcommands
│   └── api/                     # future, not in MVP
│
├── packages/
│   ├── sources/
│   │   └── malopolskie-media/
│   ├── spotify/
│   ├── normalizer/
│   ├── matcher/
│   ├── database/
│   │   ├── schema.ts
│   │   └── migrations/
│   └── shared/
│
├── config/
│   └── stations.json
│
├── storage/                     # all gitignored
│   ├── db/
│   ├── logs/
│   ├── auth/spotify.json
│   └── overrides.json
│
├── package.json
├── bun.lock
├── tsconfig.json
├── biome.json
└── README.md
```

---

# Applications

## apps/worker

Main application — a **one-shot CLI**, not a daemon. Each invocation runs the
full pipeline for one station and exits. Scheduling is the OS's job (see
`Scheduling`).

Responsibilities:

* crawling the configured source for a station
* parsing songs
* normalization
* Spotify matching (with cache)
* playlist replacement on Spotify

Subcommands:

```bash
bun run sync --station=radio-zet           # full pipeline
bun run crawl --station=radio-zet [--day=YYYY-MM-DD]   # crawl only, no Spotify writes
bun run spotify:auth                       # one-time refresh-token bootstrap
bun run overrides:validate                 # parse storage/overrides.json, report conflicts
bun run export-unmatched [--station=...] [--since=YYYY-MM-DD] [--all] > unmatched.csv
bun run export-playlist --name="<playlist name>" > matches.csv   # dump a Spotify playlist's tracks
bun run status [--strict]                  # last successful crawl + sync per station, stuck-run check
bun run prune-audit [--keep-days=90] [--dry-run]   # delete old crawl_runs / playlist_sync_runs
```

Every command starts by applying pending Drizzle migrations (no-op when up to
date). The worker is the migration runner — there is no separate operator
step.

---

## apps/api

Optional future API.

Possible future use cases:

* dashboard
* statistics
* health checks
* playlist preview

Not required for MVP.

---

# Packages

## packages/sources

Contains parsers for data sources, not for radio stations.

A **source** is a website that exposes playlist data. A single source can serve
many stations via different URL parameters. The MVP relies on one source
(`malopolskie-media.info`) that covers all four target stations and 50+ more,
so the MVP ships with one parser, not four.

The split is intentional:
* A station is a configuration entry (`config/stations.json`)
* A source is a code unit (`packages/sources/<source-id>/`)
* `station.source` points to a source; `station.slug` parametrizes it

### Layout

```txt
packages/sources/
  malopolskie-media/
    index.ts          # source registration
    url.ts            # URL builder
    parse.ts          # cheerio extraction
    types.ts
```

### Responsibilities

* build source URLs from `(station-slug, date, hour-range)`
* fetch HTML
* extract songs as `{ sourceTrackId, artists, title, playedAt }`
* return raw rows for the normalizer — never reach into the database or Spotify

---

## packages/spotify

Spotify integration layer.

### Responsibilities

* authentication
* playlist creation
* playlist updates
* track search
* Spotify API abstraction

---

## packages/normalizer

Song normalization logic.

### Responsibilities

* cleanup artist names
* cleanup titles
* remove noise
* standardize metadata

---

## packages/matcher

Spotify matching engine.

### Responsibilities

* Spotify search
* confidence scoring
* fuzzy matching
* cache handling

---

## packages/database

Database layer.

### Responsibilities

* schema
* migrations
* queries
* repositories

---

## packages/shared

Shared utilities and types.

### Example

```txt id="h54ogt"
packages/shared/
  logger.ts
  types.ts
  date.ts
```

---

# Configuration

## config/stations.json

Committed. Defines stations and the Spotify playlist they sync into.

```json
[
  {
    "id": "radio-zet",
    "name": "ZET",
    "source": "malopolskie-media",
    "sourceSlug": "radio-zet",
    "playlistName": "Radio Zet Weekly Playlist",
    "enabled": true
  },
  {
    "id": "rmf-fm",
    "name": "RMF FM",
    "source": "malopolskie-media",
    "sourceSlug": "rmf-fm",
    "playlistName": "Radio RMF FM Weekly Playlist",
    "enabled": true
  }
]
```

* `playlistName` is the **lookup key** into the user's Spotify library. The
  worker resolves it to a playlist ID at runtime via the Spotify Web API
  (paginates `/v1/me/playlists`, finds the first match by exact name). See
  `Playlist Strategy → Playlist discovery` below.
* No playlist ID is ever stored in this file — the config stays human-readable
  and safe to commit even with the repo public.
* The playlist must be **created by hand once during setup** with that exact
  name. The worker never auto-creates a playlist.
* Anyone forking the repo replaces the names with their own and creates the
  matching playlists in their Spotify account.
* `enabled: false` skips the station without removing its row.

## storage/overrides.json

Gitignored. See `Manual Overrides`.

## Environment variables

Loaded once at startup by `packages/shared/config.ts` — the **only** file in
the repo that reads `process.env` / `Bun.env`. Every other package and app
imports the typed config object. A linter rule (or grep gate in CI) enforces
this boundary.

```
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
LOG_LEVEL=info
```

---

# Storage

```
storage/
  db/                 # SQLite database files (gitignored)
  logs/               # one log file per command-station combo, truncated on each run
    crawl-radio-zet.log
    sync-radio-zet.log
    ...
  auth/
    spotify.json      # Spotify refresh token, 0600, gitignored
  overrides.json      # manual Spotify ID overrides, 0600, gitignored
```

Log files are **truncated on every invocation** — only the most recent run is retained per command per station. Long-term log history is intentionally out of scope: if a run needs forensic analysis, the run file is read before the next invocation overwrites it. Stdout is unaffected and can be captured by the scheduler if longer history is needed.

All of `storage/` is gitignored — it contains state, secrets, and personal
operator preferences that must not enter the public repository.

---

# Data Sources

## malopolskie-media.info (MVP source)

Aggregator site that exposes daily playlists for the four MVP stations and
many more.

### URL pattern

```
https://malopolskie-media.info/playlista/<station-slug>/YYYY-MM-DD/<hour-from>/<hour-to>.html
```

Examples:

```txt
https://malopolskie-media.info/playlista/radio-zet/2026-05-24/0/24.html
https://malopolskie-media.info/playlista/rmf-fm/2026-05-24/0/24.html
https://malopolskie-media.info/playlista/rmf-maxx/2026-05-24/0/24.html
https://malopolskie-media.info/playlista/radio-eska/2026-05-24/0/24.html
```

`0/24` returns the full day. Smaller ranges are supported but not used by the
worker — one fetch per (station, day) is enough.

### Station slugs (MVP)

```
radio-zet, rmf-fm, rmf-maxx, radio-eska
```

The full slug list is visible in the site's station dropdown. New stations need
nothing but a config entry — no code change.

### Page structure

Server-rendered HTML, **no JavaScript required**. The playlist is a single
`<table class='table table-striped table-hover'>` inside the article body.
Each hour starts with a header row (`<tr class='bg-primary'>`); each song is
a row with two cells:

```html
<tr>
  <td><center>00:08</center></td>
  <td>
    <a href='/playlista/utwor/86665-komodo-i-just-died-in-your-arms.html'>
      <i class='glyphicon glyphicon-music'></i> Komodo - (I Just) Died In Your Arms
    </a>
  </td>
</tr>
```

### Crawl strategy

* `fetch` + `cheerio` — default and sufficient for this source
* Playwright fallback — not needed for malopolskie-media; reserved for future
  sources that render their playlist client-side

---

# Parsing Strategy

## Extraction selector

```css
table.table tr > td:nth-child(2) > a[href^="/playlista/utwor/"]
```

## Per-song fields

| Field | Source | Notes |
|---|---|---|
| `sourceTrackId` | URL — numeric prefix of the slug | `/utwor/86665-komodo-...` → `86665` |
| `playedAt` | sibling `<td>` text | `"00:08"` combined with the page's day |
| `displayText` | anchor inner text, icon stripped | `"Komodo - (I Just) Died In Your Arms"` |
| `station` | from caller context | not in HTML |

## sourceTrackId — strong dedup hint

The numeric ID prefix is stable for the same song across all stations and
days on this aggregator. It is the primary deduplication key **before**
Spotify matching even runs:

* Same `sourceTrackId` observed twice → same song
* Two `sourceTrackId`s that normalize to the same artist+title pair → still
  same song, but only the matcher confirms it

Storing `sourceTrackId` per source lets us skip re-normalization and
re-matching for known songs.

## Visible text as source of truth

The inner text — after stripping the `<i>` icon — is the canonical
"artist - title" string. Example:

```txt
Pitbull / Christina Aguilera - Feel This Moment
```

---

# Normalization Rules

Goal: produce a stable `normalizedKey` that two equivalent songs always
collapse onto, regardless of small textual variance.

## Cleanup steps

Applied in order:

1. Strip the `<i>` icon and surrounding whitespace
2. Lowercase
3. Replace `&amp;`, `&` with `and`
4. Remove featuring markers: `feat.`, `ft.`, `featuring`
5. Remove parenthetical noise: `(Original Mix)`, `(Radio Edit)`, `[Bonus Track]`
6. Collapse duplicate whitespace
7. Trim

## Polish-specific normalization

The aggregator returns Polish diacritics verbatim (`Miłości`, `Hyży`,
`Dąbrowska`). Spotify search tolerates both forms but cache hits demand a
single canonical key.

Approach:

* Persist the **original** strings with diacritics in the database
* Build `normalizedKey` from an **ASCII-folded** copy:
  `ł→l, ą→a, ę→e, ć→c, ń→n, ó→o, ś→s, ź→z, ż→z` and standard Unicode NFD strip
* Both forms are tried against Spotify (ASCII-folded first, then diacritic
  fallback) and the result is cached against `normalizedKey`

This avoids cache misses caused by encoding drift between source pages.

## Artist split

Artists are separated by ` / ` in the visible text:

```txt
Kayah / Grzegorz Hyży → ["Kayah", "Grzegorz Hyży"]
```

The first artist is treated as the primary artist for Spotify search; the
others are added as `artist:` query terms when the first attempt fails.

## Title split

Split only on the **first** ` - ` to keep titles that legitimately contain a
dash:

```txt
Komodo - (I Just) Died In Your Arms
→ artist = "Komodo"
→ title  = "(I Just) Died In Your Arms"
```

---

# Duplicate Detection

The same song may appear multiple times during a day or week. The Spotify
playlist must contain each unique song only once, but the play count per song
must be preserved for ranking and future analytics.

## Dedup hierarchy

Applied in this order:

1. **`(source, sourceTrackId)`** — exact match on the source's stable ID.
   Resolves 100% of intra-source repeats with zero ambiguity.
2. **`normalizedKey`** — for cross-source repeats and for songs that the
   source assigns a different ID to (rare on this aggregator).
3. **Matched Spotify track ID** — final safety net once both songs resolved
   to the same Spotify track.

## Play counting

Every observation writes a row to `plays`. The playlist construction joins on
the resolved Spotify track and orders by descending play count, breaking ties
by `last_seen_at`.

```sql
SELECT spotify_track_id, COUNT(*) AS plays, MAX(played_at) AS last_seen_at
FROM plays
WHERE station = ? AND played_at >= ?
GROUP BY spotify_track_id
ORDER BY plays DESC, last_seen_at DESC
LIMIT 50;
```

---

# Matcher Thresholds

Every song goes through Spotify search. The result falls into one of three
buckets, all explicit:

| Score range | Bucket | Action |
|---|---|---|
| `score ≥ 0.85` | auto-match | Cache + use in playlist |
| `0.60 ≤ score < 0.85` | low-confidence | Write to `unmatched_songs` with `reason='low_confidence'` and `best_candidate_id`; do not put in playlist |
| `score < 0.60` or no results | not-found | Write to `unmatched_songs` with `reason='no_results'`; do not put in playlist |
| HTTP / API error | error | Retry path; on final failure write `reason='api_error'` |

## Score components

```
score = 0.5 * titleSimilarity(normalized) +
        0.4 * artistOverlap(normalized) +
        0.1 * durationProximity(if available)
```

Use Jaro–Winkler for both string similarity components; reject anything that
drops below 0.5 on title similarity regardless of artist overlap.

## Manual override

Manual overrides do not live in `unmatched_songs` — they live in a separate
file-based mechanism that also covers the case of an *auto-matched but wrong*
Spotify ID. See `Manual Overrides`.

---

# Manual Overrides

The matcher is fallible — both ways. It can give up on a song that does
exist on Spotify, and it can confidently pick the wrong track (a remaster vs.
the original, a cover vs. the original, the wrong featuring credit). Both
need an operator escape hatch that beats the matcher.

## Storage

A single file, edited by hand:

```
storage/overrides.json     # gitignored, 0600
```

The worker loads this file at start. It is **the** source of truth for
manual mappings: on every sync, override-derived matches are upserted into
`spotify_matches` with `source_of_truth='manual'`. Removing an entry from
the file removes the override on the next run.

## Format

```json
{
  "overrides": [
    {
      "match": { "source": "malopolskie-media", "source_track_id": "86665" },
      "spotify_id": "spotify:track:0jXQrPLm...",
      "note": "Aggregator entry — most specific match"
    },
    {
      "match": { "normalized_key": "kayah|podatek od milosci" },
      "spotify_id": "spotify:track:1bDpRwjq...",
      "note": "Auto-matcher picked the wrong rendition"
    },
    {
      "match": { "artist": "Sylwia Grzeszczak", "title": "Dobre Myśli" },
      "spotify_id": "spotify:track:abc...",
      "note": "Human-friendly form — normalized at load time"
    }
  ]
}
```

## Resolution order

A song may collide with multiple `match` blocks. The most specific match wins:

1. `(source, source_track_id)` exact
2. `normalized_key` exact
3. `(artist, title)` after running the same normalization the matcher uses

## Startup validation

On load, the worker fails fast (`exit 1`) if any of the following are true:

* `spotify_id` is not a valid Spotify track URI
* The same `match` block resolves to two different `spotify_id`s
* Two overrides at the same priority level target the same song

This prevents quietly inconsistent mappings.

## Lifecycle

* New song appears in `unmatched_songs` → operator inspects, finds the right
  Spotify ID, adds an override to `storage/overrides.json`, re-runs sync
* Auto-matched song turns out wrong → operator deletes the old
  `spotify_matches` entry (or it gets overridden on the next sync) and adds
  the corrected override

## Authoring workflow

Hand-typing Spotify IDs into JSON is painful and error-prone. The workflow
below uses Spotify's UI as a drag-and-drop "resolver" and an LLM as the
fuzzy matcher between the two CSV exports:

```text
1. bun run export-unmatched > unmatched.csv
   → list of songs the matcher could not place

2. In Spotify, create a playlist (e.g. "Radiofy Manual Matches"),
   search each unmatched song and drag the right track into the playlist

3. bun run export-playlist --name="Radiofy Manual Matches" > matches.csv
   → list of the Spotify tracks you picked, with their stable IDs

4. Hand both CSVs to an LLM with the prompt:
   "Pair each row of unmatched.csv with its corresponding row in matches.csv
    by artist + title similarity. For each pair, emit an entry in this
    JSON schema: { match: { source, source_track_id }, spotify_id, note }.
    Skip rows you cannot confidently pair."

5. Save the resulting array as storage/overrides.json (or append to it)

6. bun run overrides:validate              → catches typos and conflicts
7. bun run sync --station=<id>             → uses the new overrides
```

Why two CSVs and an LLM rather than typing IDs by hand:

* You never copy-paste a 22-character Spotify ID
* Spotify's search UI is dramatically better than any CLI search
* The fuzzy "this artist+title in CSV A is the same as this artist+title in
  CSV B" step is exactly what an LLM is good at, and trivial to verify by
  spot-checking the resulting JSON

The `export-playlist` command never modifies anything — it only reads. Safe
to re-run while the worker is also running.

---

# Time Semantics

| Concept | Definition |
|---|---|
| Timezone of stations | `Europe/Warsaw` |
| Storage | All `played_at` / `*_at` columns are UTC ISO-8601 with `Z` suffix |
| Display | UI / CSV exports render in `Europe/Warsaw` |
| Week window | Rolling 7 days ending at the sync run's start time |
| Day window | Aggregator returns `[00:00, 24:00)` local time per page |
| History retention | `plays`: keep forever (cheap); `crawl_runs` & `playlist_sync_runs`: 90 days then prune |

## Why rolling 7 days

A calendar week (Mon–Sun) means the playlist is freshest on Monday and stalest
on Sunday. Rolling 7 days gives an equally fresh playlist every day, which
matters once the worker runs daily.

---

# Unmatched Songs Tracking

Songs that the matcher cannot place (no results, low confidence, API error)
must be visible to an operator so they can be inspected and, where possible,
resolved manually.

## Storage

```sql
CREATE TABLE unmatched_songs (
  id INTEGER PRIMARY KEY,
  normalized_key TEXT NOT NULL UNIQUE,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_track_id TEXT,
  station TEXT NOT NULL,                   -- first station that saw it
  first_seen_at TEXT NOT NULL,             -- ISO-8601 UTC
  last_seen_at TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,                    -- 'no_results' | 'low_confidence' | 'api_error'
  best_candidate_spotify_id TEXT,          -- nullable
  best_candidate_score REAL,               -- nullable
  resolved_at TEXT                         -- nullable; auto-set when an override resolves this song
);

CREATE INDEX idx_unmatched_open ON unmatched_songs(resolved_at) WHERE resolved_at IS NULL;
```

This table is a triage inbox only. The resolution itself lives in
`storage/overrides.json` (see `Manual Overrides`). When the override loader
finds an entry that matches an unmatched row, the row's `resolved_at` is
set on the next sync — it stays in the table as audit history but drops out
of the open-issues index and the default CSV export.

Upsert per `normalized_key`: every new encounter bumps `occurrence_count`
and `last_seen_at`.

## CSV export

A CLI command produces a flat CSV for spreadsheet inspection:

```bash
bun run export-unmatched [--station=radio-zet] [--since=2026-05-01] > unmatched.csv
```

Columns: `normalized_key, artist, title, source, source_track_id, station,
reason, occurrence_count, first_seen_at, last_seen_at,
best_candidate_spotify_id, best_candidate_score`.

By default only rows with `resolved_at IS NULL` are exported (the open
backlog). Use `--all` to include already-resolved entries.

Sorting: by `occurrence_count DESC` so the most-played missing songs surface
first — those are the highest-value manual fixes.

---

# Playlist Strategy

One persistent Spotify playlist per radio station. The playlist is created
once during setup with a known human-readable name; the worker resolves the
name to a playlist ID at sync time and only ever **replaces its tracks** —
it never creates or deletes the playlist itself. Users keep their saves,
follows, and notification settings.

Example:

```txt
Radio Zet Weekly Playlist
```

## Playlist discovery

The worker does not store playlist IDs in config. On each sync run it calls
`getPlaylistByName(name)` which paginates `GET /v1/me/playlists` (50 per page)
and returns the first playlist whose `name` matches the config value exactly.

* **No match** → throws `PlaylistNotFoundError(name)` — operator must create
  the playlist in Spotify with that exact name. The worker never auto-creates.
* **Multiple matches** → returns the first one and logs a `warn` so the
  operator can rename the duplicate.
* **No caching across runs** — Spotify's API is cheap relative to a weekly
  sync, and a stale cached ID would silently break recovery after a
  delete-and-recreate.

This is the same pattern used in the prior Rust prototype (`get_playlist_by_name`).

## Update atomicity

Spotify's `PUT /v1/playlists/{id}/tracks` atomically replaces the entire
playlist content — but **only up to 100 URIs per call** (Spotify API hard
limit). Beyond 100 tracks the operation becomes a sequence (`PUT` first 100,
`POST` each subsequent batch), with a transient state visible to listeners
between calls.

MVP policy:

* **Hard cap of 50 tracks** per playlist for v1 — well under the 100-URI
  atomic limit, identical behaviour to the previous Rust-based prototype, and
  safely below any per-request edge case Spotify might enforce in future
* Single `PUT` per sync → true atomicity, no observable intermediate state
* If a future ranking ever needs >100 tracks, the multi-batch path
  (`PUT` + `POST...`) and its visible intermediate state are added in a
  dedicated ticket and documented in the operations runbook

The official `@spotify/web-api-ts-sdk` does **not** batch automatically —
the worker controls chunking explicitly.

## Update trigger

A `playlist_sync_runs` row is opened before the first call and closed after
the last call succeeds. A row with `finished_at IS NULL` older than 5 minutes
is treated as a failed run and surfaces in health checks.

---

# Spotify Authentication

Playlist writes require **user-level OAuth** with scopes
`playlist-modify-public` and `playlist-modify-private`. Client Credentials
flow is read-only and is not sufficient.

## Flow

1. **One-time setup** — operator runs `bun run spotify:auth`, which opens a
   browser to the Spotify consent screen, captures the redirect at
   `http://127.0.0.1:8888/callback`, exchanges the code, and persists the
   refresh token to `storage/auth/spotify.json` (gitignored).
2. **Every worker run** — read `refresh_token` from the file, exchange for a
   fresh access token (~1h lifetime), use it for all calls in the run.
3. **Token expiry mid-run** — on `401` from any call, refresh once and retry;
   on second `401` fail the run loudly.
4. **Refresh token revoked** — operator must re-run `bun run spotify:auth`.
   The worker exits non-zero with a clear hint; health check surfaces the
   stuck state.

## Storage layout

```
storage/auth/
  spotify.json        # { refresh_token, scopes, obtained_at, client_id_hint }
```

File is `0600` and outside any Drizzle-managed table — secrets do not belong
in SQLite.

## Required env

```
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

All loaded via `config/`. No `process.env` access outside that layer.

---

# Scheduling

The worker is a **one-shot CLI**. It does the full pipeline for one station
on each invocation and exits. Scheduling is the operating system's job.

## Local development

```bash
bun run sync --station=radio-zet
```

## Production trigger

`launchd` (macOS) / `systemd-timer` (Linux). Recommended cadence:

| Job | Frequency | Notes |
|---|---|---|
| Crawl | Daily at 03:00 Europe/Warsaw | Cheap HTTP fetch; daily cadence survives single-day aggregator outages |
| Sync | Weekly, Sunday 04:00 Europe/Warsaw | One Spotify write per station per week, matches "weekly playlist" cadence |

Single-station per invocation; the scheduler fires `4 × (daily-crawl + weekly-sync) = 4 jobs/day + 4 jobs/week`. A station's failure does not block others.

**Sync semantics**: gather → sort → resolve → `PUT` is end-to-end transactional from the user's perspective. The Spotify `PUT` is the final step and only runs when the prior steps produced a non-empty URI list. If anything throws earlier, the existing playlist on Spotify is left untouched until a future successful run.

## Overlap protection

A `crawl_runs` / `playlist_sync_runs` row with `finished_at IS NULL` younger
than the cron interval blocks a new run for the same station. Older rows are
treated as crashed and overridden.

---

# Database Strategy

SQLite, managed by Drizzle. One file per environment in `storage/db/`.

Used for:

* persisting every play observation (`plays`)
* canonicalizing songs after normalization (`songs`)
* caching Spotify matches (`spotify_matches`)
* tracking unmatched / low-confidence songs (`unmatched_songs`)
* auditing crawl and sync runs (`crawl_runs`, `playlist_sync_runs`)

## Schema sketch

Intentionally compact — full DDL lives in `packages/database/schema.ts`.

```sql
-- Every observation from any source
CREATE TABLE plays (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,                    -- 'malopolskie-media'
  source_track_id TEXT NOT NULL,           -- stable per source
  station TEXT NOT NULL,                   -- 'radio-zet'
  song_id INTEGER NOT NULL REFERENCES songs(id),
  played_at TEXT NOT NULL,                 -- UTC ISO-8601
  crawled_at TEXT NOT NULL,
  UNIQUE(source, source_track_id, station, played_at)
);
CREATE INDEX idx_plays_station_time ON plays(station, played_at DESC);

-- Canonical song after normalization
CREATE TABLE songs (
  id INTEGER PRIMARY KEY,
  normalized_key TEXT NOT NULL UNIQUE,     -- ASCII-folded "artist|title"
  primary_artist TEXT NOT NULL,
  all_artists TEXT NOT NULL,               -- pipe-joined list, original form
  title TEXT NOT NULL                      -- original form
);

-- Spotify match cache (one row per resolved song)
CREATE TABLE spotify_matches (
  song_id INTEGER PRIMARY KEY REFERENCES songs(id),
  spotify_track_id TEXT NOT NULL,
  score REAL NOT NULL,
  matched_at TEXT NOT NULL,
  source_of_truth TEXT NOT NULL            -- 'auto' | 'manual'
);

-- Unmatched / low-confidence inbox (schema detailed above)
-- see "Unmatched Songs Tracking"

-- Audit
CREATE TABLE crawl_runs (
  id INTEGER PRIMARY KEY,
  station TEXT NOT NULL,
  day TEXT NOT NULL,                       -- YYYY-MM-DD (Europe/Warsaw)
  started_at TEXT NOT NULL,
  finished_at TEXT,                        -- nullable; null while running
  songs_seen INTEGER,
  error TEXT
);

CREATE TABLE playlist_sync_runs (
  id INTEGER PRIMARY KEY,
  station TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  tracks_written INTEGER,
  error TEXT
);
```

## Migrations

Drizzle migrations live in `packages/database/migrations/`. Forward-only by
default; destructive migrations carry an explicit `// IRREVERSIBLE` marker
and a rollback recipe in the result document of the migration's ticket.

**Auto-applied at startup**: every worker CLI invocation calls
`migrate(db, { migrationsFolder })` before any other DB work. It's a no-op
when up to date and adds milliseconds to startup. There is no separate
operator step — `bunx drizzle-kit migrate` is only used during development
to test migrations before commit.

---

# Critical Design Decisions

## Use deterministic matching

AI is not responsible for primary song matching. Fuzzy string similarity plus
configurable thresholds plus a manual override file beats a black-box model
in operability and trust.

---

## Use caching aggressively

Spotify searches are expensive and rate-limited. Every resolved match is
cached in `spotify_matches`. The matcher only ever calls Spotify for songs
without a cache hit and without an applicable override.

---

## File-based manual overrides

Manual mappings live in `storage/overrides.json`, not in the database. They
are read at startup and override the cache. Reasons: editable in a text
editor, diffable, backupable, and a single human-readable source of truth.

---

## One source serves many stations

The MVP source (`malopolskie-media.info`) covers all four stations. New
stations from the same aggregator are config-only changes. A second source
becomes a new parser package, not a fork of the first.

---

## Avoid unnecessary browser automation

Playwright is reserved for future sources whose playlists are client-rendered.
The MVP source serves static HTML and needs only `fetch` + `cheerio`.

---

# MVP Scope

Version 1 should support:

* Radio ZET
* Radio ESKA
* RMF MAXX
* RMF FM

---

# Future Extensions

Possible future features:

* analytics dashboard
* trending songs
* top weekly rankings
* multi-country radio support
* YouTube playlist export
* Apple Music integration
* public API
