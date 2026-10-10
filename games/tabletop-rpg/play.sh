#!/usr/bin/env bash
# play.sh — Unified Launcher for RobOS Tabletop RPG: HeroQuest
set -e

if [[ -n "$GODOT_BIN" && -x "$GODOT_BIN" ]]; then
  GODOT="$GODOT_BIN"
elif [[ -x "$HOME/.local/bin/godot" ]]; then
  GODOT="$HOME/.local/bin/godot"
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

echo "🛡️ Launching RobOS Tabletop RPG: HeroQuest..."
echo "  Engine: $GODOT"
echo "  Project: $PROJECT_DIR"
# Parse convenience CLI flags into environment variables
for arg in "$@"; do
  if [[ "$arg" == "--reset" || "$arg" == "-r" || "$arg" == "--force-reload" ]]; then
    export TABLETOP_RESET=1
  fi
  if [[ "$arg" == "--demo" || "$arg" == "-d" || "$arg" == "--auto-play" ]]; then
    export TABLETOP_DEMO=1
    export TABLETOP_AUTO_PLAY=1
  fi
  if [[ "$arg" == "--player" ]]; then
    export TABLETOP_ROLE=player
  fi
  if [[ "$arg" == "--dm" || "$arg" == "--gm" ]]; then
    export TABLETOP_ROLE=gm
  fi
  if [[ "$arg" == "--hard" || "$arg" == "--hard-mode" ]]; then
    export TABLETOP_HARD_MODE=1
    export TABLETOP_DIFFICULTY=hard
  fi
done

# Separate Godot engine flags from project/game args so engine flags (like --quit-after) are parsed reliably
engine_args=()
game_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --headless|--quit)
      engine_args+=("$1")
      shift
      ;;
    --quit-after)
      engine_args+=("$1" "$2")
      shift 2
      ;;
    --quit-after=*)
      engine_args+=("$1")
      shift
      ;;
    *)
      game_args+=("$1")
      shift
      ;;
  esac
done

exec "$GODOT" "${engine_args[@]}" --path "$PROJECT_DIR" "${game_args[@]}"
