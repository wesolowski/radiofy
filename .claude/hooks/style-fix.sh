#!/usr/bin/env bash
#
# PostToolUse hook (Edit|Write): runs the project code-style fixer on the file
# that was just created or edited. Deterministic — does not rely on prompting.
#
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.jsonc) ;;
  *) exit 0 ;;
esac

command -v bunx >/dev/null 2>&1 || exit 0

bunx biome check --write "$file"
