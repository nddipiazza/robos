#!/usr/bin/env bash
# quest-editor.sh — Launch Tabletop Quest Map Editor for HeroQuest scenarios
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"
APP_DIR="$REPO_ROOT/packages/tabletop-quest-editor"

TARGET="${1:-first-light-dungeon}"

echo "🗺️ Opening Tabletop Quest Map Editor with: $TARGET"
exec "$APP_DIR/launch.sh" "$TARGET" "${@:2}"
