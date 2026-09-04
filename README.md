# Radiofy

Sync Polish radio station playlists into Spotify automatically.

Radiofy is a small Bun + TypeScript worker that crawls daily radio playlists
from a public aggregator, deduplicates and matches each song against the
Spotify catalogue, and replaces a per-station Spotify playlist with the
most-played tracks of the rolling 7-day window.

> **Status**: MVP implementation complete. All 13 backlog tickets are merged
> and the worker runs end-to-end against the configured Spotify account.

---

## What it does

For each configured station the worker runs a one-shot pipeline:

1. **Crawl** — fetch the previous day's playlist HTML from
   `malopolskie-media.info`, parse it with cheerio, persist every play into a
   local SQLite database.
2. **Normalize** — clean up artist and title strings, fold Polish diacritics,
   produce a stable `normalizedKey` per song.
3. **Resolve** — look each unique song up on Spotify (search + Jaro-Winkler
   scoring), cache the result, route low-confidence hits and outright misses
   into an `unmatched_songs` triage table.
4. **Replace** — once a week, group the rolling-7-day plays by resolved
   Spotify track, sort by play count, clear the target Spotify playlist,
   and re-append every resolved track in batches of 100.

A separate workflow lets you resolve unmatched songs by hand: dump the open
backlog as CSV, find the songs in Spotify and drop them into a "manual
matches" playlist, dump that playlist as CSV, then produce a JSON override
file from the two CSVs. See
[`PROJECT_ARCHITECTURE.md → Manual Overrides → Authoring workflow`](docs/architecture/PROJECT_ARCHITECTURE.md).

---

## Tech stack

- **Runtime**: Bun
- **Language**: TypeScript (strict)
- **HTML parsing**: cheerio
- **Database**: SQLite + Drizzle ORM
- **External API**: Spotify Web API (`@spotify/web-api-ts-sdk`)
- **Tooling**: Biome (format + lint), `bun test`, `date-fns-tz`

Bun is intentionally chosen for the small backend-worker footprint: native
TypeScript, built-in test runner, fast cold start. Drizzle keeps the schema
in code and migrations forward-only.

---

## Project layout

```
radiofy/
├── .claude/                  # contributor workflow: rules, agents, hooks, ticket template
├── docs/
│   ├── architecture/
│   │   └── PROJECT_ARCHITECTURE.md     # full design — read this first
│   ├── html/                            # source HTML fixtures for parser tests
│   └── ticket/
│       ├── backlog/{todo,in-progress,review,done}/
│       ├── results/                     # one result doc per closed ticket
│       └── testdata/
├── apps/
│   └── worker/                          # one-shot CLI: 8 subcommands + lib helpers
├── packages/
│   ├── shared/                          # logger, config loader, types, date utils
│   ├── sources/                         # malopolskie-media HTML parser
│   ├── normalizer/                      # Polish ASCII fold + cleanup pipeline
│   ├── spotify/                         # OAuth, search, scoring, playlist API
│   ├── matcher/                         # overrides + resolveSong orchestration
│   └── database/                        # Drizzle schema, migrations, repositories
├── config/
│   └── stations.json                    # station definitions, committed
└── storage/                             # local-only: SQLite DB, logs, OAuth token, overrides.json (gitignored)
```

The full layout, including each package's responsibilities and the database
schema, is in [`docs/architecture/PROJECT_ARCHITECTURE.md`](docs/architecture/PROJECT_ARCHITECTURE.md).

---

## CLI commands

All commands are run via `bun run <name>` from the repo root. Each starts by
applying any pending database migrations and then does its work.

### Daily / weekly (scheduler)

#### `bun run crawl [--station=<id>] [--day=YYYY-MM-DD] [--days=N]`

Fetches one or more days of playlist HTML from the configured source, parses
it, normalizes the songs, and writes the results into the local SQLite
database. **No Spotify calls** — this is purely the radio-side ingestion step.
Without `--station` it crawls every enabled station in `config/stations.json`;
pass `--station=<id>` to target a single one. Defaults to the last 7 days
(the week ending yesterday in `Europe/Warsaw`). Pass `--days=N` for a different
range, or `--day=YYYY-MM-DD` for a single date; `--day` overrides `--days` when
both are given. Running twice on the same `(station, day)` is idempotent thanks
to a unique constraint. Transient upstream errors (HTTP 5xx, network blips) are
retried with backoff, and a day that still fails is skipped without aborting the
station's remaining days. In an all-stations run a failing station does not stop
the rest; the command exits non-zero if any day or station failed.

Use it when: the daily cron job fires (no flags); after a fresh setup or
multi-day outage (`--days=N`); to re-crawl a specific date (`--day=YYYY-MM-DD`).

#### `bun run sync [--station=<id>]`

The end-to-end pipeline. Looks at the rolling 7-day play history for the
station, resolves each song to a Spotify track (manual override → cache →
live search), groups by resolved track, sorts by play count, then clears
the Spotify playlist whose name matches the station's `playlistName` and
appends the resolved tracks back in chunks of 100. **This is the only
command that writes to Spotify.** Without `--station` it syncs every enabled
station; a failing station does not stop the rest and the command exits
non-zero if any station failed.

Use it when: you've just added a manual override and want to apply it
immediately, or you need to re-sync without re-crawling.

#### `bun run weekly`

The whole weekly refresh in one call: crawls every enabled station over the
default window, then syncs every enabled station. Takes no flags — use `crawl`
and `sync` directly for anything narrower. The sync phase runs even when the
crawl phase lost days or stations, so a partial upstream outage still leaves
you with an up-to-date playlist built from the days that did arrive. Exits `0`
when everything succeeded, `1` if anything failed, `2` if anything was blocked
by a run already in flight.

Use it when: the weekly cron job fires. The scheduler templates shipped in
`docs/operations/` still install the split daily-crawl / weekly-sync jobs;
switching them over to this command is a separate ticket.

#### `bun run chart`

Replaces one playlist with a chart page's current contents. Unlike `crawl` /
`sync`, a chart is a ranking rather than a play log: the page dictates the
order, so the tracks are written in the page's own order — the ranked chart
first, then the unranked proposals below it — and nothing is re-sorted by play
count. Charts are configured in `config/charts.json`, deliberately **not** in
`config/stations.json`, so no all-stations command can reach a chart playlist.

The playlist is left untouched unless the run is plausible: if the page request
fails, if the parser finds fewer than the chart's configured `minEntries`, or
if not a single entry resolves on Spotify, the run fails and the previous
playlist contents survive. This matters because the update is a clear-and-fill:
without the floor, a redesign of the source page could replace the playlist
with a handful of tracks. Exits `0` clean, `1` on failure, `2` when a run is
already in flight.

Use it when: the chart changed and you want the playlist to follow. Independent
of the station schedule — a chart moves on its own rhythm.

### Setup (one-time per machine)

#### `bun run spotify:auth`

Opens the Spotify consent page in your browser, captures the redirect on a
local `127.0.0.1:8888` listener, exchanges the authorization code, and
writes the refresh token to `storage/auth/spotify.json` with mode `0600`.
Uses PKCE (S256) and a CSRF `state` parameter. After this runs once, every
subsequent `bun run sync` can refresh tokens without further interaction.

Use it when: first-time setup, or after Spotify revokes the refresh token
(usually because you revoked the app's access in your Spotify account
dashboard).

### Manual override authoring (when the auto-matcher misses)

#### `bun run export-unmatched [--station=<id>] [--since=YYYY-MM-DD] [--all]`

Dumps the open `unmatched_songs` triage backlog to stdout as RFC 4180 CSV,
sorted by `occurrence_count DESC`. Default scope is all open (unresolved)
rows; `--all` includes already-resolved rows, `--station` filters to one
station, `--since` filters by first-seen date.

Use it when: you want to see what the auto-matcher couldn't place, and start
fixing it by hand.

#### `bun run export-playlist --name="<playlist name>"`

Reads the named Spotify playlist via your OAuth token and dumps its tracks
to stdout as CSV (`spotify_track_id, primary_artist, all_artists, title,
added_at`). Read-only on both Spotify and the local database.

Use it when: you've manually curated a "Radiofy Manual Matches" playlist in
Spotify (drag-drop the songs you want for unmatched entries) and need the
Spotify IDs to author override entries.

> **The combined workflow**: `export-unmatched` + `export-playlist` give you
> two CSVs. Hand them to an LLM with the prompt described in the runbook;
> it produces a valid `storage/overrides.json` you can paste back.

#### `bun run overrides:validate`

Parses `storage/overrides.json` and reports one of three results: file
missing, valid with N overrides loaded, or schema/conflict error with the
offending entry indices. Does not touch the database or Spotify.

Use it when: you've just edited `storage/overrides.json` and want to catch
typos before the next sync run uses the file.

### Operations

#### `bun run status [--strict]`

Prints a per-station health table (last successful crawl, last successful
sync, open unmatched count) plus totals for cache size and stuck runs.
Exit code is `0` when every enabled station has crawled within the last
36 hours and no run is stuck; `1` otherwise. `--strict` also fails when a
station has never been crawled (default treats it as "no data yet" and
exits `0`).

Use it when: you want to know if the cron actually ran, or as a monitoring
probe (any non-zero exit means something needs attention).

#### `bun run prune-audit [--keep-days=90] [--dry-run]`

Deletes `crawl_runs` and `playlist_sync_runs` rows older than `--keep-days`
(default 90). Only touches rows with `finished_at IS NOT NULL` — open /
in-flight runs are never deleted. With `--dry-run` it just prints the
counts that would be deleted.

Use it when: monthly housekeeping, or before a long flight if you obsess
about disk usage.

#### `bun run prune-plays [--keep-days=30] [--dry-run]`

Deletes rows from the `plays` table whose `played_at` is older than
`--keep-days` (default 30). Sync only ever uses the rolling 7-day window,
so 30 days is plenty of headroom; anything older is dead weight. With
`--dry-run` it just prints the count. Refuses `--keep-days=0` to make
"accidental delete everything" impossible.

Use it when: monthly housekeeping. Without it the local SQLite database
grows ~30 MB per year per four stations.

### Testing helpers

#### `bun run test:unit`

Runs only the unit tests under `packages/*/test/`. No Spotify or network
access. Fast.

#### `bun run test:integration`

Runs only `tests/integration/*.test.ts`. Tests are skipped unless
`RADIOFY_INTEGRATION=1` is set, so it's safe to call from CI. With the env
var set, these tests hit the real Spotify API against a dedicated test
playlist (see `RADIOFY_INTEGRATION_PLAYLIST` in `.env.example`).

#### `bun test`

Runs everything (unit + integration), with integration tests skipped by
default. The CI-friendly catch-all.

---

## Quickstart

```bash
# 1. Clone and install
git clone git@github.com:wesolowski/radiofy.git
cd radiofy
bun install

# 2. Configure Spotify
cp .env.example .env
# fill SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from your Spotify Developer Dashboard

# 3. Create the target Spotify playlists by hand
#    (one per station, the exact name goes into config/stations.json)

# 4. Edit config/stations.json — list each station with its source slug
#    and the human-readable name of its Spotify playlist

# 5. One-time OAuth
bun run spotify:auth

# 6. First sync
bun run sync --station=zet
```

Once that works, install a scheduler — templates are in
[`docs/operations/`](docs/operations/) (see the next section).

**Deploying to a remote server?** The OAuth flow assumes a local browser,
so headless hosts need either an SSH port-forward or a copy of
`storage/auth/spotify.json` from a machine that already authenticated. The
full server-side checklist (Bun install, headless OAuth, persistent
`storage/` paths, file permissions, log rotation) is in
[`docs/operations/runbook.md` → "Server deployment"](docs/operations/runbook.md#server-deployment).

---

## What's in `docs/operations/`

Everything an operator needs after the code is checked out.

```
docs/operations/
├── runbook.md                                 # the operator guide
├── bin/
│   └── radiofy-cron.sh                        # runs one command under a dead-man switch
├── cron/
│   └── crontab.example                        # Linux: weekly refresh + daily chart (simplest fit)
├── launchd/
│   ├── com.radiofy.weekly.plist.template      # macOS: weekly refresh, Sundays 04:00 local
│   └── com.radiofy.chart.plist.template       # macOS: chart refresh, daily 05:00 local
└── systemd/
    ├── radiofy-weekly.{service,timer}         # Linux: OnCalendar Sun *-*-* 04:00 Europe/Warsaw
    └── radiofy-chart.{service,timer}          # Linux: OnCalendar *-*-* 05:00 Europe/Warsaw
```

Pick **one** scheduler. For a typical Linux server cron is the simplest fit;
launchd is the native macOS choice; systemd-timer is for hosts where you
already manage other systemd units. The runbook walks through installing each.

### `runbook.md`

Step-by-step operator guide:

- **First-time setup** — Spotify dev app, `.env`, hand-creating the target
  Spotify playlists, reviewing `config/stations.json`, running
  `bun run spotify:auth`.
- **Server deployment** — prerequisites, the two headless-OAuth options
  (SSH port forward or local-auth + `scp`), persistent state directories,
  file permissions, log rotation, server checklist.
- **Daily operations** — `bun run status` for health checks.
- **Triage workflow** — the LLM-assisted procedure for resolving unmatched
  songs through `export-unmatched` + `export-playlist`.
- **Monthly housekeeping** — `bun run prune-audit`.
- **Scheduling** — installing the templates below.
- **Failure notification** — setting up the dead-man switch, and proving the
  alarm actually fires before trusting it.
- **Recovery** — concrete steps for revoked OAuth tokens, stuck syncs,
  override-file conflicts, and DB corruption.

### `bin/radiofy-cron.sh`

The wrapper every scheduled job goes through. It runs one Radiofy command,
signals a health-check URL before the run and again afterwards — success or
failure — and exits with the command's own exit code.

The URL is looked up by *variable name* in the checkout's `.env` and passed to
`curl` on standard input, so it appears neither in the crontab nor in any
command line. The file is read rather than sourced, so nothing in it is
executed and nothing leaks into the worker's environment. With no URL configured the command
still runs and nothing is sent, so the schedule works before monitoring exists.
Ping failures are swallowed on purpose: a monitoring outage must not fail a run
that worked, nor hide one that did not.

It exists instead of a longer cron line because the obvious one-liner is wrong.
In `command && curl "$URL" || curl "$URL/fail"`, a success ping that fails to
send makes the `||` branch report a failure that never happened.

### `cron/crontab.example`

A drop-in `crontab` covering the weekly refresh (Sunday 04:00) and the daily
chart (05:00), both pinned to `Europe/Warsaw` via `CRON_TZ`, plus monthly
pruning and a commented-out daily crawl for mid-week self-healing. Adjust the
path variables at the top, then `crontab -e` and paste.

### `launchd/*.plist.template`

Two macOS launchd jobs, one per scheduled command. The literal placeholder
`/ABSOLUTE/PATH/TO/radiofy` marks the checkout directory; the runbook shows the
`sed` one-liner that turns a template into a real plist.

### `systemd/radiofy-{weekly,chart}.{service,timer}`

The Linux equivalent, one unit pair per scheduled command. The `OnCalendar`
clauses are already correct and `Persistent=true` catches a job missed while the
machine was off. The only line you may need to edit is `Environment=BUN=` if Bun
is not at `/usr/local/bin/bun`.

---

## Data source

Crawled from [`malopolskie-media.info`](https://malopolskie-media.info/) — a
public Polish radio playlist aggregator. The aggregator exposes a single URL
pattern per `(station, day, hour-range)`, so one parser covers all four MVP
stations (ZET, RMF FM, RMF MAXX, ESKA) and 50+ others.

The site is queried with conservative cadence (one daily fetch per station)
and the worker honors all `Retry-After` headers it receives.

---

## Documentation

- [`docs/architecture/PROJECT_ARCHITECTURE.md`](docs/architecture/PROJECT_ARCHITECTURE.md) — full design, schema, decisions
- [`docs/operations/runbook.md`](docs/operations/runbook.md) — first-time setup, daily ops, recovery
- [`docs/operations/`](docs/operations/) — `launchd` plists and `systemd` units/timers
- [`docs/ticket/`](docs/ticket/) — implementation history (done/) and result documents
- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — contribution rules, code quality gate, public-repo hygiene

---

## Contributing

The repo follows a ticket-driven workflow. Each ticket is a self-contained
markdown file in `docs/ticket/backlog/<status>/` and moves through
`todo → in-progress → review → done`. New work begins by picking the next
ticket from `todo`.

Rules and quality gate are in [`.claude/CLAUDE.md`](.claude/CLAUDE.md):

- One ticket per change, scope-disciplined diffs
- Strict TypeScript, Biome-clean, type-check + tests pass
- No secrets, credentials, or personal data in committed files (see
  *Public Repository Hygiene*)

PRs are how changes land on `main` going forward.

---

## License

[MIT](LICENSE).
