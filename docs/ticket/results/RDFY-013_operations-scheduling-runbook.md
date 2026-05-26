# RDFY-013 — Operations runbook + schedule templates

## Outcome
Approved. Ticket moved review -> done.

## What was delivered
- `docs/operations/launchd/com.radiofy.crawl.STATION.plist.template` — daily 03:00 crawl per station
- `docs/operations/launchd/com.radiofy.sync.STATION.plist.template` — weekly Sunday 04:00 sync per station
- `docs/operations/systemd/radiofy-crawl@.{service,timer}` — `OnCalendar=*-*-* 03:00:00 Europe/Warsaw`, `Persistent=true`
- `docs/operations/systemd/radiofy-sync@.{service,timer}` — `OnCalendar=Sun *-*-* 04:00:00 Europe/Warsaw`, `Persistent=true`
- `docs/operations/runbook.md` — first-time setup, daily ops, unmatched-songs triage, monthly housekeeping, scheduling (incl. weekly-only alternative + trade-off), recovery (revoked token, stuck sync, override file conflict, corrupted DB)
- `README.md` — status updated to MVP-complete; quickstart references runbook + templates

## Verification
- launchd plists: `xmllint` valid; crawl `Hour=3/Minute=0`, sync `Weekday=0/Hour=4/Minute=0`
- systemd units: correct calendars in `Europe/Warsaw`, `Persistent=true` so missed runs catch up
- All 8 commands referenced in the runbook exist in `package.json` (`crawl`, `sync`, `spotify:auth`, `status`, `export-unmatched`, `export-playlist`, `overrides:validate`, `prune-audit`)
- `bunx tsc --noEmit` clean
- `bunx biome check .` clean across 111 files
- `bun test` — 234 pass, 1 skip, 0 fail across 34 files
- Confidentiality grep: no Claude/AI/Anthropic leaks; runbook "LLM" mention refers to the operator-side override-authoring workflow (per ticket scope)

## Acceptance criteria
All five criteria met. Recovery section covers the four required scenarios. README quickstart fits one screen and links out.

## Risk
low — docs and templates only, no code changes.
