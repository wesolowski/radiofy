# RDFY-029 — Scheduled runs with a dead-man switch

## Outcome
Approved after two review rounds. Scheduled runs now report to an external
health check through `docs/operations/bin/radiofy-cron.sh`: a start signal
before the run, then success or failure, with the command's own exit code
passed through untouched. The alarm is raised by the *absence* of an expected
signal, which is the only thing that catches the failure that actually
happened — a scheduler that was never installed, so nothing ran and nothing
complained for two months.

The scheduling templates now describe two jobs, the weekly refresh and the
chart, instead of eight per-station entries.

## Two design decisions worth keeping
**The monitor lives off the machine.** A watchdog on the server it watches goes
quiet at exactly the moment it should be shouting. A self-hosted dashboard on
that same box would have stayed just as silent during the outage it was meant
to catch.

**A wrapper, not a longer cron line.** The obvious one-liner
`command && curl "$URL" || curl "$URL/fail"` reports a failure that never
happened whenever the success ping itself fails to send. The wrapper captures
the exit code before deciding, and swallows ping errors so a monitoring outage
can neither fail a working run nor hide a broken one.

## Files changed
- `docs/operations/bin/radiofy-cron.sh` — new.
- `apps/worker/test/cron-wrapper.test.ts` — new, 16 tests.
- `docs/operations/systemd/radiofy-{weekly,chart}.{service,timer}`,
  `docs/operations/launchd/com.radiofy.{weekly,chart}.plist.template` — replace
  the per-station units.
- `docs/operations/cron/crontab.example`, `docs/operations/runbook.md`,
  `README.md`, `.env.example`.

## Review findings addressed
The first pass returned nine findings; all nine are fixed and were re-verified
in a second pass.

- **The weekly launchd job would have run daily.** Renaming the per-station
  template dropped `Weekday=0`, so on macOS every station playlist would have
  been replaced every morning at 04:00 — contradicting the README, the cadence
  table and the 7-day check period. This was the most damaging finding and it
  was entirely self-inflicted by the rename.
- **`.env` was sourced, which executed it.** Values reached the worker's
  environment with their line endings intact, so a file saved on Windows would
  have handed Spotify a secret ending in a carriage return: scheduled runs
  failing authentication while manual ones worked. A value containing an unset
  reference aborted the wrapper before the command ran and before any ping —
  the silent non-run this ticket exists to prevent. The single key is now read,
  never executed.
- **A start signal could be sent with no matching end.** The directory change
  now precedes it, and an argument that is not a variable name is rejected
  outright instead of tripping over the indirect expansion.
- **The "never in `ps`" claim was false**; the URL was a curl argument. It now
  reaches curl through a config file on standard input, so the claim is true
  rather than softened.
- **The tests asserted only exit codes.** A wrapper that pinged failure after a
  successful run would have passed. They now assert which endpoints are pinged.
  Measured against the naive one-liner: 4 of 9 failing before, 11 of 16 after,
  five of those for behavioural reasons rather than exit codes.
- Lower items: the crontab's dead `RADIOFY` variable, ping latency, an
  unreachable env prefix in the verification steps, and undocumented overrides.

The second pass found one regression from those fixes — the runbook still told
operators to adjust `RADIOFY` after the crontab had renamed it — plus a
tolerance regression: a pasted URL with trailing whitespace produced a
malformed request that curl rejected, and because ping errors are swallowed, no
ping was sent at all. Both fixed, and the extraction was then probed against
trailing spaces, quoted values, quoted values with trailing spaces, values
containing `=` and `&`, a key that is a prefix of another, and a commented-out
key.

## Verification
- `bash -n`, `plutil -lint` on both plists — clean.
- `bunx tsc --noEmit` — exit 0. `bun test` — 317 pass / 1 skip / 0 fail.
- End-to-end against a local HTTP server, because a test with a fake `curl`
  does not prove requests leave the machine: success sent `/start` then the
  plain URL, failure sent `/start` then `/fail`, an unconfigured check sent
  nothing, and exit codes 0, 1, 0 passed through unchanged.

## What the operator still has to do
Install the schedule on a host and create the monitoring account. The runbook
covers service choice, periods and grace, and a verification procedure whose
last step is the one that matters: disable the schedule, let the grace period
pass, and confirm the alarm arrives without anyone doing anything. An untested
alarm is worse than none, because it buys confidence it has not earned.
