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

### 5. Review `config/stations.json`

```json
[
  {
    "id": "zet",
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
bun run crawl --station=zet --days=7    # one-shot week backfill
bun run sync  --station=zet
```

(Use `--day=YYYY-MM-DD` instead of `--days=7` to crawl one specific day. The
cron job calls `bun run crawl --station=<id>` without any flags and gets the
default last-7-days behaviour.)

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
bun run sync --station=zet
```

After step 6, the resolved entries in `unmatched_songs` get their `resolved_at` set and drop out of the default `export-unmatched` output.

---

## One-off: rows under retired station ids

Installations that ran before the station ids were unified may hold rows under
the older spellings (`radio-zet`, `radio-eska`, `rmf-fm`, `rmf-maxx`) — in
`plays`, and also in `unmatched_songs` and `crawl_runs`.

Anything that reads the station list ignores them: `crawl`, `sync` and
`top-played` all work from `config/stations.json`, so a retired id is simply
never scanned. One command does surface them: `bun run export-unmatched`
without `--station` lists every open row regardless of station, so retired
entries land in your correction backlog and get curated for a station that no
longer exists.

Check what is there, and whether it duplicates rows you already have under the
current ids:

```bash
sqlite3 storage/db/radiofy.db "
  select station, count(*), min(substr(played_at,1,10)), max(substr(played_at,1,10))
  from plays group by station order by station;"
```

If a retired id's rows are all duplicated under its current id, they can be
deleted. Verify first, delete second — this statement only reports:

```bash
sqlite3 storage/db/radiofy.db "
  select count(*) from plays a
  where a.station = 'radio-zet'
    and exists (select 1 from plays b
                where b.station = 'zet' and b.source = a.source
                  and b.source_track_id = a.source_track_id
                  and b.played_at = a.played_at);"
```

When that count equals the retired id's total row count, nothing unique is
lost by removing them. Repeat the check for each retired id you found — the
statement above names one id at a time on purpose, so a copy-paste cannot
delete more than you verified:

```bash
sqlite3 storage/db/radiofy.db "
  delete from plays           where station = 'radio-zet';
  delete from unmatched_songs where station = 'radio-zet';
  delete from crawl_runs      where station = 'radio-zet';"
```

The duplicate check above covers `plays` only. `unmatched_songs` and
`crawl_runs` carry no history worth keeping for a station you no longer crawl:
the first is a correction backlog that can only be acted on for a configured
station, the second an audit trail of runs that will never repeat.

This is deliberately not automated: station ids are operator configuration, and
a migration shipped with the code would rename or delete ids that are perfectly
valid in someone else's installation.

## Monthly housekeeping

```bash
bun run prune-audit --dry-run             # see how many audit rows would be deleted
bun run prune-audit                       # actually delete (default --keep-days=90)
bun run prune-plays --dry-run             # see how many old plays would be deleted
bun run prune-plays                       # actually delete (default --keep-days=30)
```

`prune-audit` only touches `crawl_runs` and `playlist_sync_runs` rows with `finished_at IS NOT NULL`. Open / in-flight rows are never deleted.

`prune-plays` deletes rows in the `plays` table whose `played_at` is older than `--keep-days` (default 30). Sync only ever consults the rolling 7-day window so anything older is safe to drop; the top-played console command still works against whatever you keep. `--keep-days=0` is refused so you can't accidentally wipe the table.

---

## Server deployment

The runbook above assumes the operator is sitting at the same machine the
worker will run on. Deploying to a remote Linux server adds three extra
concerns: getting Bun on the host, getting through the Spotify OAuth flow
without a browser, and keeping persistent state in the right place.

### Prerequisites on the server

| Requirement | Notes |
|---|---|
| **Bun** | `curl -fsSL https://bun.sh/install \| bash` — installs into `~/.bun/bin/bun`. Confirm with `bun --version`. The crontab example expects an absolute path, so capture `which bun` once installed. |
| **git** | Needed for the initial clone and later `git pull` updates. |
| **A dedicated user** | Recommended. The worker only needs its own home directory; no `sudo` or system services. |
| **System timezone** | The schedule pins to `Europe/Warsaw` via `CRON_TZ`, so the host timezone is free. If the host is already on `Europe/Warsaw`, remove the `CRON_TZ` line from the crontab. |
| **Outbound HTTPS** | The worker needs `:443` to `developer.spotify.com`, `api.spotify.com`, `accounts.spotify.com`, and the aggregator host (`odsluchane.eu`). No inbound ports are required at runtime. |

### Headless OAuth — two options

`bun run spotify:auth` listens on `127.0.0.1:8888` for the PKCE callback and
opens a browser. On a headless server there is no browser, so pick one of
the two flows below.

**Option A — SSH port forwarding (recommended; keeps the token on the server).**

```bash
# Local machine: open the tunnel and keep this session running.
ssh -L 8888:127.0.0.1:8888 <user>@<host>

# Inside the SSH session, on the server:
cd /path/to/radiofy
bun run spotify:auth
```

The server prints the Spotify consent URL. Paste it into the browser on
your **local** laptop. Because of the `-L` tunnel, the redirect to
`http://127.0.0.1:8888/callback` is forwarded back to the server, the auth
flow completes, and `storage/auth/spotify.json` is written on the server —
no copying needed.

**Option B — Auth locally, copy the token.**

If port forwarding is not an option (jump hosts, restrictive networks):

```bash
# Local machine — fully working checkout with the same .env:
bun run spotify:auth

# Then ship the token to the server:
scp storage/auth/spotify.json <user>@<host>:/path/to/radiofy/storage/auth/spotify.json
ssh <user>@<host> 'chmod 0600 /path/to/radiofy/storage/auth/spotify.json'
```

Either way, after this step the server has a valid refresh token and never
needs a browser again until Spotify revokes it.

### Persistent state under `storage/`

Everything the worker keeps between runs lives under `storage/` inside the
checkout. The worker creates these directories on first use; they must
survive across runs and across `git pull`.

| Path | Contents | Backup-worthy? |
|---|---|---|
| `storage/auth/spotify.json` | OAuth refresh token, mode `0600` | yes — re-auth otherwise |
| `storage/db/radiofy.db` | SQLite: songs, plays, matches, audit, unmatched | yes — losing it forces a fresh crawl + match cycle |
| `storage/overrides.json` | Curated manual matches | yes — re-curate otherwise |
| `storage/logs/` | Per-command logs + `cron.log` | no — recreated on every run |

`storage/` is already in `.gitignore`. Do **not** check any of it in.

### File permissions

After the first `spotify:auth` (or after `scp`), verify:

```bash
ls -l storage/auth/spotify.json
# expected: -rw------- (0600), owned by the worker user
```

If the mode is wrong (`0644`, world-readable), `chmod 0600` it.

### Log rotation

`storage/logs/cron.log` is append-only — without rotation it grows forever.
Either install a `logrotate` snippet:

```
/path/to/radiofy/storage/logs/cron.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
```

…or accept that the per-command JSON logs at
`storage/logs/<command>-<station>.log` are truncated on every run and treat
`cron.log` as best-effort.

### Server setup checklist

1. Install Bun on the server: `curl -fsSL https://bun.sh/install | bash`
2. `git clone` the repo to the location the cron job will reference
3. `cp .env.example .env` and fill in Spotify credentials
4. Edit `config/stations.json` for the stations you want
5. Create the matching empty playlists in Spotify (one per station)
6. Run OAuth via **Option A** (SSH port forward) or **Option B** (local
   auth + `scp`) — see above
7. Verify: `ls -l storage/auth/spotify.json` is `0600`
8. Smoke-test: `bun run crawl --station=<id> --days=1` then
   `bun run sync --station=<id>` — the target playlist now has tracks
9. Edit the path variables at the top of
   `docs/operations/cron/crontab.example`, then `crontab -e` and paste
10. `crontab -l` to verify, then watch `storage/logs/cron.log` after the
    next scheduled run

`bun run status` (any time after the first run) returns exit `0` once a
recent crawl succeeded for every enabled station.

---

## Scheduling

The worker is a one-shot CLI, so the OS scheduler owns the timing. Two jobs are
worth scheduling:

| Job | Cadence | What it does |
|---|---|---|
| `weekly` | Sunday 04:00 Europe/Warsaw | crawls the past week for every enabled station, then replaces every station playlist |
| `chart` | daily 05:00 Europe/Warsaw | replaces the chart playlist from the current chart page |

Both run through `docs/operations/bin/radiofy-cron.sh`, which reports the
outcome to a dead-man switch (see the next section). The wrapper works with no
monitoring configured, so you can install the schedule first and add monitoring
after.

Three scheduler options ship in `docs/operations/`:

| Scheduler | When to pick it | Where |
|---|---|---|
| **cron** | Linux server, simplest fit | `docs/operations/cron/crontab.example` |
| **launchd** | macOS | `docs/operations/launchd/*.plist.template` |
| **systemd-timer** | Linux server already running other systemd units | `docs/operations/systemd/radiofy-*.{service,timer}` |

### Linux (cron, recommended for most servers)

Open `docs/operations/cron/crontab.example`, adjust `RADIOFY`, `BUN` and `RUN`
to match your checkout, then install:

```bash
crontab -e   # paste the contents, save, quit
crontab -l   # verify
```

`CRON_TZ` pins the schedule to `Europe/Warsaw`, so the times fire correctly even
if the server's clock is UTC. Output from each run is appended to
`storage/logs/cron.log`; the worker also writes its own structured-JSON file at
`storage/logs/<command>-<station>.log`, truncated on every invocation.

### macOS (launchd)

```bash
mkdir -p ~/Library/LaunchAgents
for job in weekly chart; do
  sed -e "s|/ABSOLUTE/PATH/TO/radiofy|$PWD|g" \
    "docs/operations/launchd/com.radiofy.$job.plist.template" \
    > ~/Library/LaunchAgents/com.radiofy.$job.plist
  launchctl load ~/Library/LaunchAgents/com.radiofy.$job.plist
done
launchctl list | grep radiofy
```

launchd runs a missed job once the machine wakes. A laptop that is asleep on
Sunday morning therefore still refreshes, just later — which is exactly why the
dead-man switch needs a grace period generous enough to cover that.

### Linux (systemd-timer)

```bash
mkdir -p ~/.config/systemd/user
cp docs/operations/systemd/radiofy-*.service ~/.config/systemd/user/
cp docs/operations/systemd/radiofy-*.timer   ~/.config/systemd/user/

# Adjust the Environment=BUN= line in the .service files if Bun is elsewhere.

systemctl --user daemon-reload
systemctl --user enable --now radiofy-weekly.timer
systemctl --user enable --now radiofy-chart.timer
systemctl --user list-timers --all
```

`Persistent=true` makes systemd run a job that was missed while the machine was
off, at the next boot.

### If you want ingestion to repair itself mid-week

The weekly job crawls the whole week in one go, so a day the source refuses
during that run is lost until the window moves past it. Adding a daily `crawl`
fixes that: each run re-crawls the last seven days, so a day lost to a source
outage is picked up the next morning. The crontab example carries the line,
commented out.

---

## Failure notification: the dead-man switch

A job that fails can send a message. A job that never starts cannot — and that
is the failure that actually happened here: no schedule existed, so nothing ran
and nothing complained for two months.

The fix is to invert the question. Instead of waiting to be told about a
failure, expect a signal at a known interval and raise the alarm when it does
not arrive. That covers the whole class at once: the scheduler was never
installed, the machine is powered off, the disk is full, Bun is missing, the
network is down, the process was killed.

### The monitor must not live on the same machine

If the monitor runs on the server it watches, both go quiet together. A
self-hosted dashboard on the same box would have stayed just as silent during
the outage it was meant to catch. Use an external service — several offer a free
tier that covers two checks.

### What the wrapper sends

`docs/operations/bin/radiofy-cron.sh` takes the *name* of an environment
variable, not a URL, so the secret never appears in the crontab or in `ps`:

```
radiofy-cron.sh RADIOFY_HEALTHCHECK_WEEKLY weekly
```

| Signal | When |
|---|---|
| `<url>/start` | before the command runs |
| `<url>` | the command exited `0` |
| `<url>/fail` | the command exited non-zero — including exit `2`, a run blocked by another already in flight |

Ping failures are swallowed deliberately: a monitoring outage must never fail a
run that worked, and must never hide a run that did not. The command's own exit
code is always what the wrapper returns.

### Setup

1. Create one check per job — one for `weekly`, one for `chart`. Separate
   checks, so a silent chart is not hidden behind a healthy weekly run.
2. Set each check's period and grace to match the schedule:

   | Check | Period | Grace |
   |---|---|---|
   | weekly | 7 days | 6 hours |
   | chart | 1 day | 2 hours |

   The grace has to cover a machine that boots late or a run that waits on a
   slow source, without being so long that a real outage goes unnoticed for
   days.
3. Paste the ping URLs into the checkout's `.env`:

   ```bash
   RADIOFY_HEALTHCHECK_WEEKLY=https://<service>/<uuid>
   RADIOFY_HEALTHCHECK_CHART=https://<service>/<uuid>
   ```

   Treat them like passwords: anyone holding a ping URL can silence that alarm.
   `.env` is gitignored and should be mode `0600`.
4. Point the alerts at something you actually read — email, a phone push, a
   chat webhook.

### Prove the alarm works before you trust it

An untested alarm is worse than none, because it buys confidence it has not
earned. Two checks, in this order:

```bash
# 1. A successful run reports success.
docs/operations/bin/radiofy-cron.sh RADIOFY_HEALTHCHECK_WEEKLY weekly
# The check flips to "up" within seconds.

# 2. A failure is reported as one.
RADIOFY_HEALTHCHECK_WEEKLY=$RADIOFY_HEALTHCHECK_WEEKLY \
  docs/operations/bin/radiofy-cron.sh RADIOFY_HEALTHCHECK_WEEKLY definitely-not-a-command
# Exits non-zero and the check flips to "down"; you should receive the alert.
```

Then the one that matters: leave the schedule disabled past the grace period
and confirm the alarm fires **without anyone doing anything**. That is the
behaviour the whole arrangement exists for, and it is the only one that cannot
be verified by running something.

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
