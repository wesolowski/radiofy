# [RDFY-013] Operations — scheduling templates, runbook, README

## Type
feature

## Risk
low

## Priority
medium

## Status
todo

## Owner
implementer

## Background
With all commands working, the system still cannot run unattended. Operators need scheduling examples for the two supported platforms and a single runbook that explains setup, daily operations, and recovery.

## Scope
- **In scope**:
  - **Schedule**: daily crawl + weekly sync (recommended)
    - Daily crawl at 03:00 Europe/Warsaw — keeps day-by-day data fresh, survives single-day aggregator outages
    - Weekly sync on Sunday at 04:00 Europe/Warsaw — one Spotify write per week per station, matches the natural "weekly playlist" cadence
    - The runbook documents an alternative "weekly-only" schedule (both jobs Sunday 03:00 with `--day=<each of last 7>` in a small wrapper) and lists its trade-off (single missed Sunday = whole week lost)
  - `docs/operations/launchd/com.radiofy.crawl.<station>.plist.template` and `com.radiofy.sync.<station>.plist.template` — one per command per station
  - `docs/operations/systemd/radiofy-crawl@.service` + `radiofy-crawl@.timer` (daily) and `radiofy-sync@.service` + `radiofy-sync@.timer` (weekly) — parametrized by station id
  - `docs/operations/runbook.md` — first-time setup (Spotify dev app, copy `.env.example` to `.env`, `bun run spotify:auth`, create the per-station playlists in Spotify by hand, fill `config/stations.json` with their **names**), daily operations, triage workflow for unmatched songs (`bun run export-unmatched` → manual resolution playlist on Spotify → `bun run export-playlist` → LLM-assisted JSON authoring → edit `storage/overrides.json` → re-sync, full procedure in architecture `Manual Overrides → Authoring workflow`), monthly housekeeping (`bun run prune-audit`), recovery steps (revoked token, stuck sync, corrupted DB, override file conflict)
  - `README.md` — project overview, quickstart (clone → install → auth → first sync), pointers to architecture and runbook
- **Out of scope (explicit)**: containerization, cloud deployment, monitoring/alerting stack, CI workflows.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Scheduling", "Spotify Authentication", "Manual Overrides"
- All prior tickets (every command must be in place)

## Acceptance Criteria
- [ ] `launchctl load` the rendered plist on macOS schedules both jobs visibly via `launchctl list | grep radiofy`
- [ ] `systemctl --user enable --now radiofy-crawl@radio-zet.timer` enables both timers, `systemctl list-timers` confirms the schedule
- [ ] Runbook walks through bootstrap end-to-end and a new reader can produce a synced playlist following only the runbook
- [ ] Recovery section covers at least: revoked Spotify token, sync failure with stuck `playlist_sync_runs`, manual override conflict, DB corruption (restore from backup)
- [ ] README quickstart fits on one screen, links out for the rest

## Verification (manual)
1. On a clean macOS account, follow the runbook from scratch → working scheduled crawl + sync for one station
2. On a Linux test VM, do the same with the systemd units → both timers fire and complete on schedule
3. Have a second person read the README + runbook with no prior knowledge and complete a first sync — note any confusion and fold the fixes back
