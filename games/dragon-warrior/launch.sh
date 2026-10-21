#!/usr/bin/env bash
# launch.sh — Unified launcher for Dragon Warrior (Godot 4)
#
# USAGE EXAMPLES:
# 1. Standard Play (Title Screen -> Save Select -> Game Flow):
#    ./launch.sh
#
# 2. Launch directly from a Save State JSON File:
#    ./launch.sh --save-state-file data/v1/save-states/castle-entrance.json
#
# 3. Debug Launch into specific scene with custom hero parameters:
#    ./launch.sh --debug --scene Castle1F --tile 8,8 --facing up --gold 120 --items "Herb;Torch"
#    ./launch.sh --debug --scene BattleTest --monster axe_knight --hero-level 15
#
# ENVIRONMENT VARIABLES:
#   DW_GODOT_BIN       - Path to Godot binary (defaults to godot4 / ~/apps/godot4/godot4)
#   DW_SAVE_STATE_FILE - Path to JSON save state file override

set -e

# Resolve Godot binary path
if [[ -n "$DW_GODOT_BIN" && -x "$DW_GODOT_BIN" ]]; then
  GODOT="$DW_GODOT_BIN"
elif command -v godot4 >/dev/null 2>&1; then
  GODOT="$(command -v godot4)"
elif command -v godot >/dev/null 2>&1; then
  GODOT="$(command -v godot)"
else
  for candidate in \
    "$HOME/apps/godot4/godot4" \
    "$HOME/apps/godot4/godot" \
    "$HOME/.local/bin/godot4" \
    "$HOME/.local/bin/godot" \
    "/usr/bin/godot4" \
    "/usr/bin/godot" \
    "/usr/local/bin/godot4" \
    "/usr/local/bin/godot" \
    "/snap/bin/godot4" \
    "/snap/bin/godot"; do
    if [[ -x "$candidate" ]]; then
      GODOT="$candidate"
      break
    fi
  done
fi

GODOT="${GODOT:-godot4}"
PROJECT="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -x "$GODOT" ]]; then
  echo "Error: Godot binary not found at '$GODOT'." >&2
  echo "Please install Godot 4.x or set DW_GODOT_BIN environment variable." >&2
  exit 1
fi

IS_DEBUG=false
SAVE_STATE_FILE="${DW_SAVE_STATE_FILE:-}"
SCENE="Castle1F"
TILE="8,8"
FACING=""
GOLD="120"
ITEMS=""
MONSTER=""
HERO_LEVEL=""

DEBUG_ARGS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) IS_DEBUG=true; shift ;;
    --save-state-file) SAVE_STATE_FILE="$2"; shift 2 ;;
    --scene) IS_DEBUG=true; SCENE="$2"; shift 2 ;;
    --tile) IS_DEBUG=true; TILE="$2"; shift 2 ;;
    --facing) IS_DEBUG=true; FACING="$2"; shift 2 ;;
    --gold) IS_DEBUG=true; GOLD="$2"; shift 2 ;;
    --items) IS_DEBUG=true; ITEMS="$2"; shift 2 ;;
    --monster) IS_DEBUG=true; MONSTER="$2"; shift 2 ;;
    --hero-level) IS_DEBUG=true; HERO_LEVEL="$2"; shift 2 ;;
    *) DEBUG_ARGS="$DEBUG_ARGS $1"; shift ;;
  esac
done

export DW_SAVE_STATE_FILE="$SAVE_STATE_FILE"

if [[ "$IS_DEBUG" == true ]]; then
  ARGS="--scene $SCENE --tile $TILE --gold $GOLD"
  if [[ -n "$FACING" ]]; then ARGS="$ARGS --facing $FACING"; fi
  if [[ -n "$ITEMS" ]]; then ARGS="$ARGS --items $ITEMS"; fi
  if [[ -n "$MONSTER" ]]; then ARGS="$ARGS --monster $MONSTER"; fi
  if [[ -n "$HERO_LEVEL" ]]; then ARGS="$ARGS --hero-level $HERO_LEVEL"; fi
  if [[ -n "$DEBUG_ARGS" ]]; then ARGS="$ARGS $DEBUG_ARGS"; fi

  echo "Starting Dragon Warrior in DEBUG mode..."
  if [[ -n "$SAVE_STATE_FILE" ]]; then
    echo " -> Save State File: $SAVE_STATE_FILE"
  fi
  echo " -> Scene: $SCENE (Tile: $TILE)"

  DISPLAY="${DISPLAY:-:0}" "$GODOT" \
    --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --path "$PROJECT" \
    res://scenes/DebugLaunch.tscn \
    -- $ARGS &
else
  echo "Starting Dragon Warrior..."
  if [[ -n "$SAVE_STATE_FILE" ]]; then
    echo " -> Save State File: $SAVE_STATE_FILE"
  fi

  DISPLAY="${DISPLAY:-:0}" "$GODOT" \
    --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --path "$PROJECT" &
fi

echo "Game started with PID=$!"
