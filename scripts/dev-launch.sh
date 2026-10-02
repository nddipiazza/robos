#!/usr/bin/env bash
# Launch any RobOS Electron app locally for development.
# Usage: scripts/dev-launch.sh <app-id>
#   e.g. scripts/dev-launch.sh security-setup
#        scripts/dev-launch.sh dev-central
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "$1" ]]; then
  echo "Usage: $0 <app-id>"
  echo ""
  echo "Available apps:"
  for d in "$REPO_ROOT/packages"/*/; do
    pkg="$(basename "$d")"
    if [[ -f "$d/main.js" && -f "$d/package.json" ]]; then
      echo "  $pkg"
    fi
  done
  exit 1
fi

APP_ID="$1"
APP_DIR="$REPO_ROOT/packages/$APP_ID"

if [[ ! -f "$APP_DIR/main.js" ]]; then
  echo "Error: no app found at packages/$APP_ID (missing main.js)"
  exit 1
fi

# Install deps if needed
if [[ ! -f "$APP_DIR/node_modules/.bin/electron" ]]; then
  echo "→ Installing dependencies for $APP_ID..."
  (cd "$APP_DIR" && npm install --quiet)
fi

echo "→ Launching $APP_ID..."
export DISPLAY="${DISPLAY:-:0}"
exec "$APP_DIR/node_modules/.bin/electron" \
  --no-sandbox --disable-gpu --disable-dev-shm-usage \
  "$APP_DIR"
