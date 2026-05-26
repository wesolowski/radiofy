# Operations runbook

This document is the single source for running Radiofy end-to-end. It assumes the architecture is already understood; see `docs/architecture/PROJECT_ARCHITECTURE.md` for the design.

---

## First-time setup

### 1. Spotify Developer app

1. Sign in at `https://developer.spotify.com/dashboard`.
2. Create a new app. Any name works; the description is not user-visible.
3. Add `http://127.0.0.1:8888/callback` as a Redirect URI.
4. Copy the `Client ID` and `Client Secret`.

### 2. Local checkout

```bash
git clone git@github.com:wesolowski/radiofy.git
cd radiofy
bun install
```

### 3. Environment variables

```bash
cp .env.example .env
```

Fill in:

```
SPOTIFY_CLIENT_ID=<from the dashboard>
SPOTIFY_CLIENT_SECRET=<from the dashboard>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
LOG_LEVEL=info
```

### 4. Create the target playlists in Spotify

For each station the worker will sync, create an empty playlist in Spotify (Web or Desktop client). The exact name must match what goes into `config/stations.json`. Recommended names: `Radio Zet Weekly Playlist`, `Radio RMF FM Weekly Playlist`, etc.

### 5. Fill `config/stations.json`

```json
[
  {
    "id": "radio-zet",
    "name": "ZET",
    "source": "malopolskie-media",
    "sourceSlug": "radio-zet",
    "playlistName": "Radio Zet Weekly Playlist",
    "enabled": true
  }
]
```

Repeat per station. Use `"enabled": false` to keep a station configured but skipped by the scheduler.

### 6. One-time OAuth

```bash
bun run spotify:auth
```

This opens the Spotify consent page in your browser and listens on `127.0.0.1:8888` for the redirect. The consent screen requests read and write access to both your public and your private playlists; both are needed because the worker looks up the target playlist by name (which requires read access to private playlists) and replaces its contents (which requires write access to whichever visibility the playlist has). After you click "Agree" the command writes `storage/auth/spotify.json` with mode `0600` and exits.

### 7. First crawl + first sync

```bash
bun run crawl --station=radio-zet --day=2026-05-25
bun run sync  --station=radio-zet
```

The Spotify playlist now contains the most-played tracks from the configured station for the last seven days.

---

## Daily operations

After the scheduler is installed (see below), the worker runs unattended. To check that it's healthy:

```bash
bun run status
```

Exit code `0` means every enabled station crawled within the last 36 hours and there are no stuck runs. Add `--strict` to also fail when a station has never been crawled.

---

## Triage workflow — unmatched songs

When the auto-matcher can't place a song, it's added to the `unmatched_songs` table. Resolve them with the LLM-assisted authoring workflow (full details in `docs/architecture/PROJECT_ARCHITECTURE.md → Manual Overrides → Authoring workflow`):

```bash
# 1. Get the open backlog
bun run export-unmatched > unmatched.csv

# 2. In Spotify, create a playlist (e.g. "Radiofy Manual Matches")
#    and drag the right Spotify tracks into it for each row in unmatched.csv.

# 3. Get the curated list
bun run export-playlist --name="Radiofy Manual Matches" > matches.csv

# 4. Give both CSVs to your LLM with the prompt:
#    "Pair each row of unmatched.csv with its corresponding row in matches.csv
#     by artist+title similarity. Emit JSON entries matching this schema:
#     { match: { source, source_track_id }, spotify_id, note }.
#     Skip rows you cannot confidently pair."

# 5. Save the resulting array under "overrides" in storage/overrides.json.

# 6. Validate and re-sync
bun run overrides:validate
bun run sync --station=radio-zet
```

After step 6, the resolved entries in `unmatched_songs` get their `resolved_at` set and drop out of the default `export-unmatched` output.

---

## Monthly housekeeping

```bash
bun run prune-audit --dry-run             # see how many audit rows would be deleted
bun run prune-audit                       # actually delete (default --keep-days=90)
```

`prune-audit` only touches `crawl_runs` and `playlist_sync_runs` rows with `finished_at IS NOT NULL`. Open / in-flight rows are never deleted.

---

## Scheduling

The worker is a one-shot CLI. Use the OS scheduler. Three options ship in
`docs/operations/`:

| Scheduler | When to pick it | Where |
|---|---|---|
| **cron** | Linux server, "one-line per job" is the simplest fit | `docs/operations/cron/crontab.example` |
| **launchd** | macOS | `docs/operations/launchd/*.plist.template` |
| **systemd-timer** | Linux server, you already manage other systemd units | `docs/operations/systemd/radiofy-*.{service,timer}` |

For a typical Linux server running radiofy as its only scheduled job, cron is
the easiest fit. Pick whichever matches the host you actually deploy on.

### Linux (cron, recommended for most servers)

Open `docs/operations/cron/crontab.example`, adjust the three variables at the
top (`RADIOFY`, `BUN`, `LOG`) to match your checkout, then install:

```bash
crontab -e   # paste the contents, save, quit
crontab -l   # verify
```

The example pins the schedule to `Europe/Warsaw` via `CRON_TZ`, so the times
fire correctly even if the server's clock is UTC. Output from each run is
appended to `storage/logs/cron.log`; the worker also writes its own
structured-JSON file at `storage/logs/<command>-<station>.log` that is
truncated on every invocation.

### macOS (launchd)

Templates: `docs/operations/launchd/com.radiofy.{crawl,sync}.STATION.plist.template`.

```bash
# Replace STATION and the absolute path, then:
mkdir -p ~/Library/LaunchAgents
sed -e "s|STATION|radio-zet|g" -e "s|/ABSOLUTE/PATH/TO/radiofy|$PWD|g" \
  docs/operations/launchd/com.radiofy.crawl.STATION.plist.template \
  > ~/Library/LaunchAgents/com.radiofy.crawl.radio-zet.plist
launchctl load ~/Library/LaunchAgents/com.radiofy.crawl.radio-zet.plist

sed -e "s|STATION|radio-zet|g" -e "s|/ABSOLUTE/PATH/TO/radiofy|$PWD|g" \
  docs/operations/launchd/com.radiofy.sync.STATION.plist.template \
  > ~/Library/LaunchAgents/com.radiofy.sync.radio-zet.plist
launchctl load ~/Library/LaunchAgents/com.radiofy.sync.radio-zet.plist

launchctl list | grep radiofy
```

The crawl agent fires daily at 03:00; the sync agent fires Sundays at 04:00.

### Linux (systemd-timer)

Templates: `docs/operations/systemd/radiofy-{crawl,sync}@.{service,timer}`.

```bash
mkdir -p ~/.config/systemd/user
cp docs/operations/systemd/radiofy-*.service ~/.config/systemd/user/
cp docs/operations/systemd/radiofy-*.timer   ~/.config/systemd/user/

# Edit ExecStart paths in the .service files if Bun isn't at /usr/local/bin/bun.

systemctl --user daemon-reload
systemctl --user enable --now radiofy-crawl@radio-zet.timer
systemctl --user enable --now radiofy-sync@radio-zet.timer
systemctl --user list-timers --all
```

### Alternative schedule

The default is daily crawl + weekly sync. To run both weekly together, change the crawl `StartCalendarInterval`/`OnCalendar` to Sundays and pass `--day=$(date -d "n days ago" +%F)` in a wrapper. Trade-off: a single missed Sunday loses the entire week's data.

---

## Recovery

### Spotify refresh token revoked

Symptom: `bun run sync` exits 1 with `SpotifyAuthExpiredError` and a hint to re-run `bun run spotify:auth`.

Fix:

```bash
rm storage/auth/spotify.json
bun run spotify:auth
```

### Sync fails with PlaylistNotFoundError after upgrading

Symptom: a private playlist that worked before now triggers `PlaylistNotFoundError` from `sync`, with no other changes in the configuration.

Cause: the OAuth scope set grew (RDFY-014 added `playlist-read-private`). The cached refresh token from before that change does not carry the new scope, so `GET /v1/me/playlists` only returns public playlists for that token.

Fix: delete the cached token and re-grant consent so the new scope is included.

```bash
rm storage/auth/spotify.json
bun run spotify:auth
```

### Stuck sync run

Symptom: `bun run status` reports a stuck run, or two cron-spawned syncs ran into each other and one exited with code 2.

Fix: the next scheduled sync will detect the stuck row (older than five minutes) and override it. To force an immediate retry, just run `bun run sync --station=<id>` manually — it will reclaim the crashed audit row.

### Override file conflict

Symptom: `bun run overrides:validate` exits 1 with a "conflict at entries [N, M]" message.

Fix: open `storage/overrides.json`, look at entries N and M, decide which mapping is correct, remove or merge the other one, re-run validate, then re-run sync.

### Corrupted SQLite database

Symptom: queries throw "database disk image is malformed".

Fix:

```bash
mv storage/db/radiofy.db storage/db/radiofy.db.bad
# the next worker invocation auto-creates a fresh db via Drizzle migrate.
```

This loses local play history, the Spotify match cache, and the unmatched backlog. The Spotify playlists themselves are untouched; the next sync rebuilds them from a fresh crawl.
