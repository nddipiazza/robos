#!/usr/bin/env bash
# map-editor.sh — Launch the Starfall Command Map Editor
# Usage: ./map-editor.sh [scenario-slug-or-path]   e.g. ./map-editor.sh siege-canyon-defense
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
MAP_ARGS=()
if [[ -n "$1" ]]; then
  MAP_ARGS=(-- "--map=$1")
fi

echo "🗺️ Opening RobOS RTS Map Editor${1:+ with: $1}"
exec "$DIR/play.sh" res://scenes/MapEditor.tscn "${MAP_ARGS[@]}"
