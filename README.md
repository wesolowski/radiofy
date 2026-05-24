# Radiofy

Sync Polish radio station playlists into Spotify automatically.

Radiofy is a small Bun + TypeScript worker that crawls daily radio playlists
from a public aggregator, deduplicates and matches each song against the
Spotify catalogue, and replaces a per-station Spotify playlist with the
most-played tracks of the rolling 7-day window.

> **Status**: planning complete, implementation not started. The architecture
> and the 13-ticket backlog are in place; no application code exists yet.

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
   Spotify track, take the top 50 by play count, atomically replace the
   target Spotify playlist's contents with one `PUT` call.

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
├── apps/                     # (not yet) CLI entry + subcommands
├── packages/                 # (not yet) sources, normalizer, matcher, spotify, database, shared
├── config/                   # (not yet) stations.json
└── storage/                  # local-only: SQLite DB, logs, OAuth token, overrides.json (gitignored)
```

The full layout, including each package's responsibilities and the database
schema, is in [`docs/architecture/PROJECT_ARCHITECTURE.md`](docs/architecture/PROJECT_ARCHITECTURE.md).

---

## CLI commands (planned)

Once the bootstrap ticket lands the project ships these subcommands:

| Command | Purpose |
|---|---|
| `bun run sync --station=<id>` | Full pipeline: gather → resolve → replace Spotify playlist |
| `bun run crawl --station=<id> [--day=YYYY-MM-DD]` | Crawl only, no Spotify writes |
| `bun run spotify:auth` | One-time OAuth bootstrap (PKCE + `state`), writes refresh token to `storage/auth/spotify.json` |
| `bun run export-unmatched [--station=...] [--since=...]` | Dump the unmatched-songs inbox as CSV |
| `bun run export-playlist --name="<name>"` | Dump a Spotify playlist as CSV (for manual override authoring) |
| `bun run overrides:validate` | Parse `storage/overrides.json`, report conflicts |
| `bun run status [--strict]` | Last successful crawl + sync per station, stuck-run check |
| `bun run prune-audit [--keep-days=90] [--dry-run]` | Drop old audit rows |

---

## Quickstart (when implementation lands)

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
bun run sync --station=radio-zet
```

A daily-crawl + weekly-sync schedule for `launchd` and `systemd` will ship in
`docs/operations/` (ticket [RDFY-013](docs/ticket/backlog/todo/RDFY-013_operations-scheduling-runbook.md)).

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
- [`docs/ticket/backlog/todo/`](docs/ticket/backlog/todo/) — 13 implementation tickets, in dependency order (`RDFY-001` first)
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
