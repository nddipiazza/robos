#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"

# Find electron binary
if [[ -n "$ELECTRON_BIN" && -x "$ELECTRON_BIN" ]]; then
  ELECTRON="$ELECTRON_BIN"
elif command -v electron >/dev/null 2>&1; then
  ELECTRON="$(command -v electron)"
elif [[ -x "$DIR/node_modules/.bin/electron" ]]; then
  ELECTRON="$DIR/node_modules/.bin/electron"
elif [[ -x "$REPO_ROOT/packages/tabletop-blockmap-creator/node_modules/.bin/electron" ]]; then
  ELECTRON="$REPO_ROOT/packages/tabletop-blockmap-creator/node_modules/.bin/electron"
elif [[ -x "$REPO_ROOT/packages/robos-tabletop/node_modules/.bin/electron" ]]; then
  ELECTRON="$REPO_ROOT/packages/robos-tabletop/node_modules/.bin/electron"
elif [[ -x "$REPO_ROOT/packages/crpg-editor/node_modules/.bin/electron" ]]; then
  ELECTRON="$REPO_ROOT/packages/crpg-editor/node_modules/.bin/electron"
else
  echo "Error: Electron binary not found." >&2
  exit 1
fi

echo "🗺️ Launching RobOS Tabletop Quest Map Editor..."
echo "  Electron: $ELECTRON"
echo "  Package: $DIR"

exec "$ELECTRON" "$DIR" --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"
