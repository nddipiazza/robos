#!/usr/bin/env bash
# debug.sh — Debug Scene Launcher for RobOS cRPG: Realm of Heroes
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
SCENE="res://scenes/CharacterSelect.tscn"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene)
      case "$2" in
        Homestead|res://scenes/Homestead.tscn) SCENE="res://scenes/Homestead.tscn" ;;
        VillageSquare|res://scenes/VillageSquare.tscn) SCENE="res://scenes/VillageSquare.tscn" ;;
        GarrisonKeep|res://scenes/GarrisonKeep.tscn) SCENE="res://scenes/GarrisonKeep.tscn" ;;
        VictoryScreen|res://scenes/VictoryScreen.tscn) SCENE="res://scenes/VictoryScreen.tscn" ;;
        TestRunner|res://tests/TestRunner.tscn) SCENE="res://tests/TestRunner.tscn" ;;
        *) SCENE="$2" ;;
      esac
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

echo "⚔️ Launching RobOS cRPG in Debug Mode..."
echo "  Scene: $SCENE"

exec "$GODOT" --path "$PROJECT_DIR" "$SCENE" "$@"
