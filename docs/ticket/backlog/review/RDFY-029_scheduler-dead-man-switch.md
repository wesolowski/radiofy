# RDFY-029 Scheduled runs with a dead-man switch

## Type
feature

## Risk
low

## Priority
high

## Status
review

## Owner
implementer

## Background
Nothing runs on a schedule. The scheduling templates have existed since
RDFY-013 but were never installed, so every run so far has been started by
hand. In practice that meant the playlists went two months without an update
after a transient outage ended a run, and nobody noticed — there was no
schedule to miss and nothing to report a miss.

Failure notification alone would not have caught it. A job that never starts
sends no failure. What catches this class of problem is a dead-man switch: an
external service that expects a signal at a known interval and raises the alarm
when the signal fails to arrive.

## Symptom
Between 2026-07-06 and 2026-09-04 no crawl and no sync ran. The playlists still
showed early-June content. `crontab -l` reported no crontab, and no launchd
agent existed. No message was sent at any point.

## Scope
- **In scope**:
  - A wrapper script that runs one Radiofy command and reports the outcome to a
    health-check URL: a start signal before the run, a success signal on exit
    `0`, a failure signal on any other exit code.
  - Health-check URLs configured through `.env`, never passed on the command
    line and never committed.
  - The wrapper stays silent and harmless when no health-check URL is
    configured, so scheduling works without a monitoring account.
  - Scheduling templates (cron, systemd, launchd) rewritten around
    `bun run weekly` and `bun run chart` instead of eight per-station lines.
  - A runbook section covering the choice of service, installation, and a
    verification step that proves the alarm actually fires.
- **Out of scope (explicit)**:
  - Installing anything on a server, and creating the monitoring account.
    Both need a host and credentials that do not exist in this repository.
  - Sending notifications from inside the worker. The scheduler knows whether a
    run happened; the worker does not, and a worker that never starts cannot
    report that it never started.
  - Any change to what `crawl`, `sync`, `weekly` or `chart` do.
  - Log rotation and monitoring dashboards.

## Why the monitor must live off the machine
A dead-man switch that shares a host with the job it watches fails with it. If
the server is powered off, unreachable or has a broken Bun installation, a
self-hosted monitor on that same server goes quiet at exactly the moment it
should be shouting — reproducing the original failure with more moving parts.
The health check therefore belongs to an external service.

## Why a wrapper rather than a longer cron line
The obvious one-liner is wrong:

```
command && curl "$URL" || curl "$URL/fail"
```

If `command` succeeds but the success ping fails — a network blip, a monitoring
outage — the `||` branch still runs and reports a failure that did not happen.
The wrapper captures the command's exit code explicitly before deciding what to
report, and swallows ping errors so a monitoring outage can never fail a run
that actually worked.

## References
- `docs/operations/cron/crontab.example`
- `docs/operations/systemd/radiofy-*.{service,timer}`
- `docs/operations/launchd/*.plist.template`
- `docs/operations/runbook.md`
- `.env.example`

## Acceptance Criteria
- [ ] `docs/operations/bin/radiofy-cron.sh` runs a Radiofy command and exits
      with that command's exit code, unchanged.
- [ ] On exit `0` it pings `<url>/start` before the run and `<url>` after it.
- [ ] On any non-zero exit it pings `<url>/start` and then `<url>/fail`, and
      never the success URL.
- [ ] A failing ping does not change the wrapper's exit code.
- [ ] With no health-check variable configured, the command still runs, no
      request is made, and the exit code is preserved.
- [ ] The health-check URL is read from `.env` by variable name, so it appears
      neither in the crontab nor in the process list.
- [ ] `.env.example` carries empty placeholders for the weekly and chart
      health checks.
- [ ] The cron, systemd and launchd templates schedule `weekly` and `chart`
      through the wrapper.
- [ ] The runbook explains service choice, installation, and how to verify the
      alarm fires.
- [ ] `bun test` passes.

## Verification (manual)
1. Run the wrapper with a health-check URL pointing at a request bin and a
   command that exits `0` → `/start` then the plain URL are requested.
2. Same with a command that exits `1` → `/start` then `/fail`; the plain URL is
   never requested; the wrapper exits `1`.
3. Unset the health-check variable and run again → the command runs, nothing is
   requested, the exit code is preserved.
4. Install the weekly job, then disable it and wait past the configured grace
   period → the monitoring service raises an alarm without any action.
