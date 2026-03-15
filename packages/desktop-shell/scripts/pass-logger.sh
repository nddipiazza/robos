#!/usr/bin/env bash
# pass access logger — wraps /usr/bin/pass to log every invocation
# Installed at ~/.local/bin/pass (takes precedence over /usr/bin/pass)

CACHE_DIR="$HOME/.cache/robos"
ACCESS_LOG="$CACHE_DIR/pass-access.log"
mkdir -p "$CACHE_DIR"

# Detect caller: if parent is a node/electron process, it's an agent; otherwise user
PARENT_CMD=$(ps -p $PPID -o comm= 2>/dev/null | tr -d ' ')
case "$PARENT_CMD" in
  node|electron|*agent*|*robos*)
    CALLER="agent" ;;
  *)
    CALLER="user" ;;
esac

TS=$(date -Iseconds)
OP="${1:-ls}"
ENTRY="${2:-}"

echo "${TS}|${CALLER}|${OP}|${ENTRY}" >> "$ACCESS_LOG"

exec /usr/bin/pass "$@"
