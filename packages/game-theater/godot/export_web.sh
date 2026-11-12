#!/usr/bin/env bash
# Exports the RobOS AI Multiplayer Game Theater Godot 4 HTTPS Web Client to ../web/godot/
set -euo pipefail
cd "$(dirname "$0")"

GODOT_BIN="${GODOT_BIN:-}"
if [[ -z "$GODOT_BIN" ]]; then
  for candidate in godot4 godot "$HOME/.local/bin/godot4" "$HOME/apps/godot4"; do
    if command -v "$candidate" >/dev/null 2>&1; then
      GODOT_BIN="$(command -v "$candidate")"
      break
    fi
  done
fi

if [[ -z "$GODOT_BIN" ]]; then
  echo "Error: godot4 binary not found on PATH." >&2
  exit 1
fi

mkdir -p ../web/godot
"$GODOT_BIN" --headless --path . --export-release "Web" ../web/godot/index.html
echo "Exported Godot 4 HTTPS Web Client to packages/game-theater/web/godot/index.html"
