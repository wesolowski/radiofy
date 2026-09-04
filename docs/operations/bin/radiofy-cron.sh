#!/usr/bin/env bash
#
# Runs one Radiofy command under a dead-man switch.
#
#   radiofy-cron.sh <HEALTHCHECK_ENV_VAR> <bun-script> [args...]
#
# Example:
#   radiofy-cron.sh RADIOFY_HEALTHCHECK_WEEKLY weekly
#
# The health-check URL is looked up by variable name in the checkout's .env, so
# it never appears in the crontab, in `ps` output, or in this file. Configure it
# as e.g. RADIOFY_HEALTHCHECK_WEEKLY=https://hc-ping.com/<uuid>
#
# Signals sent, matching the healthchecks.io convention:
#   <url>/start   before the command runs
#   <url>         the command exited 0
#   <url>/fail    the command exited non-zero
#
# With no URL configured the command still runs and nothing is sent. Ping
# failures are swallowed: a monitoring outage must never fail a working run,
# and must never hide a broken one.

set -uo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: radiofy-cron.sh <HEALTHCHECK_ENV_VAR> <bun-script> [args...]" >&2
  exit 64
fi

HEALTHCHECK_VAR="$1"
shift

ROOT="${RADIOFY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
BUN="${BUN:-bun}"
LOG="${RADIOFY_CRON_LOG:-$ROOT/storage/logs/cron.log}"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

URL="${!HEALTHCHECK_VAR:-}"

ping() {
  [ -n "$URL" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${URL}${1}" || true
}

mkdir -p "$(dirname "$LOG")"

ping "/start"

cd "$ROOT" || exit 66
"$BUN" run "$@" >>"$LOG" 2>&1
rc=$?

if [ "$rc" -eq 0 ]; then
  ping ""
else
  echo "radiofy-cron: '$*' exited $rc" >>"$LOG"
  ping "/fail"
fi

exit "$rc"
