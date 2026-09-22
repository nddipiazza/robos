#!/usr/bin/env bash
# play.sh — Unified Launcher for RobOS cRPG: Realm of Heroes
set -e

# Find Godot binary
if [[ -n "$GODOT_BIN" && -x "$GODOT_BIN" ]]; then
  GODOT="$GODOT_BIN"
elif [[ -x "$HOME/apps/godot4" ]]; then
  GODOT="$HOME/apps/godot4"
elif command -v godot4 >/dev/null 2>&1; then
  GODOT="$(command -v godot4)"
elif command -v godot >/dev/null 2>&1; then
  GODOT="$(command -v godot)"
else
  echo "Error: Godot 4 binary not found. Please install Godot 4 or set GODOT_BIN." >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "⚔️ Launching RobOS cRPG: Realm of Heroes..."
echo "  Engine: $GODOT"
echo "  Project: $PROJECT_DIR"

exec "$GODOT" --path "$PROJECT_DIR" "$@"
