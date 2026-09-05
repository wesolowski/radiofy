#!/usr/bin/env bash
#
# Runs one Radiofy command under a dead-man switch.
#
#   radiofy-cron.sh <HEALTHCHECK_ENV_VAR> <bun-script> [args...]
#
# Example:
#   radiofy-cron.sh RADIOFY_HEALTHCHECK_WEEKLY weekly
#
# Signals sent, matching the healthchecks.io convention:
#   <url>/start   before the command runs
#   <url>         the command exited 0
#   <url>/fail    the command exited non-zero
#
# The ping URL is looked up by variable name — first in the environment, then
# in the checkout's .env — so it appears neither in the crontab nor in any
# command line, including this script's own. With no URL configured the command
# still runs and nothing is sent. Ping failures are swallowed: a monitoring
# outage must never fail a working run, and must never hide a broken one.
#
# The .env file is read, never sourced. Sourcing it would execute it, and would
# leak values into the worker's environment with their line endings intact — a
# file saved with CRLF would hand Spotify a secret ending in a carriage return.
# Bun loads .env from the working directory by itself, which is all the worker
# needs.
#
# Environment overrides:
#   RADIOFY_ROOT      checkout to run in     (default: three levels above this
#                     file — set it explicitly when invoking through a symlink,
#                     which resolves relative to the link, not its target)
#   RADIOFY_CRON_LOG  combined log file      (default: $RADIOFY_ROOT/storage/logs/cron.log)
#   BUN               path to the bun binary (default: bun from PATH)

set -uo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: radiofy-cron.sh <HEALTHCHECK_ENV_VAR> <bun-script> [args...]" >&2
  exit 64
fi

HEALTHCHECK_VAR="$1"
shift

if ! [[ "$HEALTHCHECK_VAR" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "radiofy-cron: '$HEALTHCHECK_VAR' is not a valid environment variable name" >&2
  exit 64
fi

ROOT="${RADIOFY_ROOT:-$(cd -P "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
BUN="${BUN:-bun}"
LOG="${RADIOFY_CRON_LOG:-$ROOT/storage/logs/cron.log}"

URL="${!HEALTHCHECK_VAR:-}"
if [ -z "$URL" ] && [ -r "$ROOT/.env" ]; then
  URL=$(
    sed -n "s/^[[:space:]]*${HEALTHCHECK_VAR}[[:space:]]*=[[:space:]]*//p" "$ROOT/.env" |
      tail -n 1 | tr -d '\r' |
      sed -e 's/[[:space:]]*$//' \
          -e 's/^"\(.*\)"$/\1/' \
          -e "s/^'\(.*\)'\$/\1/" \
          -e 's/[[:space:]]*$//'
  )
fi

notify() {
  [ -n "$URL" ] || return 0
  printf 'url = "%s"\n' "${URL}${1}" | curl -fsS -m 10 --retry 2 -o /dev/null -K - || true
}

if ! cd "$ROOT"; then
  echo "radiofy-cron: cannot enter $ROOT" >&2
  exit 66
fi
mkdir -p "$(dirname "$LOG")"

notify "/start"

"$BUN" run "$@" >>"$LOG" 2>&1
rc=$?

if [ "$rc" -eq 0 ]; then
  notify ""
else
  echo "radiofy-cron: '$*' exited $rc" >>"$LOG"
  notify "/fail"
fi

exit "$rc"
